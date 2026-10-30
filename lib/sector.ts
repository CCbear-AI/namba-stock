// 類股指數：歷史日 K（data/sector-tse.json、data/sector-otc.json）＋ MIS 即時
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getQuotes } from "./mis";
import { misOhlc } from "./misStats";
import { getDaily } from "./history";
import { UNIVERSE } from "./universe";
import { getMarket } from "./market";
import type { Bar } from "./types";

type Store = { bars: Record<string, [string, number, number, number, number][]> };
const stores: Record<string, { at: number; s: Store }> = {};

function load(market: "tse" | "otc" = "tse"): Store {
  const hit = stores[market];
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.s;
  const f = path.join(process.cwd(), "data", `sector-${market}.json`);
  const s: Store = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { bars: {} };
  stores[market] = { at: Date.now(), s };
  return s;
}

// 上櫃：MIS 名稱（櫃買半導體類指數）↔ 櫃買歷史名稱（半導體業）
const OTC_ALIAS: Record<string, string> = { 營建: "建材營造", 化工: "化學", 紡纖: "紡織纖維", 機械: "電機機械" };
const normName = (n: string) => n.replace(/^櫃買/, "").replace(/類指數$|指數$/, "").replace(/設備業$|工業$|業$/, "");
function historyKey(name: string, market: "tse" | "otc") {
  const st = load(market);
  if (market === "tse") return st.bars[name] ? name : null;
  if (name === "櫃買指數") return st.bars[name] ? name : null;
  const want = OTC_ALIAS[normName(name)] ?? normName(name);
  return Object.keys(st.bars).find((k) => normName(k) === want) ?? null;
}

const TSE_CODES = Array.from({ length: 31 }, (_, i) => `tse_t${String(i + 1).padStart(2, "0")}.tw`);
const OTC_CODES = ["otc_o00.tw", ...Array.from({ length: 32 }, (_, i) => `otc_o${String(i + 1).padStart(2, "0")}.tw`)];

export type SectorQuote = { id: string; name: string; short: string; market: "tse" | "otc"; price: number; prev: number; pct: number; hasHistory: boolean };

let live: { at: number; list: SectorQuote[] } | null = null;

export async function sectorQuotes(): Promise<SectorQuote[]> {
  if (live && Date.now() - live.at < 15_000) return live.list;
  const qs = await getQuotes([...TSE_CODES, ...OTC_CODES]);
  const list = qs
    .filter((q) => q.price > 0)
    .map((q) => {
      const market = q.c.startsWith("o") ? "otc" : "tse";
      const short = q.n.replace(/^櫃買/, "").replace(/類指數$/, "").replace(/業$/, "");
      return {
        id: q.c, name: q.n, short, market,
        price: q.price, prev: q.prev, pct: q.prev ? Math.round(((q.price - q.prev) / q.prev) * 10000) / 100 : 0,
        hasHistory: Boolean(historyKey(q.n, market)),
      } as SectorQuote;
    });
  live = { at: Date.now(), list };
  return list;
}

// 類股指數名稱 → 成分股的產業（個股清單裡的 ind）
const ELEC = ["半導體", "電腦及週邊", "光電", "通信網路", "電子零組件", "電子通路", "資訊服務", "其他電子"];
const IND_ALIAS: Record<string, string[]> = {
  電子工: ELEC, 電子: ELEC, 化學生技醫療: ["化學", "生技醫療"], 電腦及週邊設備: ["電腦及週邊"],
  紡纖: ["紡織纖維"], 機械: ["電機機械"], 營建: ["建材營造"], 化工: ["化學"],
};
/** 類股成交量（張）＝成分股官方日 K 成交量加總（跟里長伯一致）：日期 → 張 */
function sectorVolume(short: string, market: "tse" | "otc", all = false) {
  const inds = new Set(IND_ALIAS[short] ?? [short]);
  const codes = UNIVERSE.filter((u) => u.m === market && (all || inds.has(u.ind))).map((u) => u.c);
  const { dates, s } = getDaily();
  const out = new Map<string, number>();
  dates.forEach((d, i) => {
    let v = 0;
    for (const c of codes) { const x = s.get(c)?.v[i]; if (x && x > 0) v += x; }
    if (v) out.set(d, v);
  });
  return { codes, out };
}

/** 類股日 K；最後一天沒有的話用即時報價補一根 */
export async function sectorDaily(id: string): Promise<Bar[]> {
  const list = await sectorQuotes();
  const q = list.find((x) => x.id === id);
  if (!q) return [];
  const key = historyKey(q.name, q.market);
  const raw = key ? load(q.market).bars[key] ?? [] : [];
  // 櫃買指數（o00）沒有對應產業 → 用全部上櫃股票的成交量
  const vol = sectorVolume(q.short, q.market, id === "o00");
  const bars: Bar[] = raw.map(([d, o, h, l, c]) => ({ time: Date.parse(d) / 1000, open: o, high: h, low: l, close: c, volume: vol.out.get(d) ?? 0 }));
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const t = Date.parse(today) / 1000;
  if (q.price && (!bars.length || bars[bars.length - 1].time < t)) {
    const wd = new Date(t * 1000).getUTCDay();
    if (wd >= 1 && wd <= 5) {
      // 今天還沒有官方日 K：用即時成交量加總
      let v = vol.out.get(today) ?? 0;
      if (!v) {
        const m = await getMarket().catch(() => null);
        const set = new Set(vol.codes);
        v = m?.stocks.reduce((a, r) => a + (set.has(r.c) ? r.vol : 0), 0) ?? 0;
      }
      bars.push({ time: t, open: q.prev, high: Math.max(q.prev, q.price), low: Math.min(q.prev, q.price), close: q.price, volume: v });
    }
  }
  return bars;
}

/** 類股當日分時（證交所每 5 秒資料，取每分鐘最後一筆） */
let intra: { at: number; date: string; fields: string[]; data: string[][] } | null = null;
export async function sectorIntraday(id: string): Promise<Bar[]> {
  const list = await sectorQuotes();
  const q = list.find((x) => x.id === id);
  if (!q || q.market !== "tse") return [];
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  if (!intra || Date.now() - intra.at > 60_000) {
    const r = await fetch(`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_INDEX?date=${today.replace(/-/g, "")}&response=json`, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    const j = await r.json();
    intra = { at: Date.now(), date: today, fields: j.fields ?? [], data: j.data ?? [] };
  }
  const col = intra.fields.indexOf(q.name);
  if (col < 0) return [];
  const out: Bar[] = [];
  for (const row of intra.data.slice(1)) {
    const v = Number(String(row[col]).replace(/,/g, ""));
    if (!v) continue;
    const [hh, mm] = row[0].split(":").map(Number);
    const time = Date.parse(`${intra.date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+08:00`) / 1000;
    const last = out[out.length - 1];
    if (last && last.time === time) { last.high = Math.max(last.high, v); last.low = Math.min(last.low, v); last.close = v; }
    else out.push({ time, open: v, high: v, low: v, close: v, volume: 0 });
  }
  return out;
}

/**
 * 加權指數日 K：證交所官方指數（data/sector-tse.json）＋官方成交量（data/taiex-vol.json，張）。
 * Yahoo 的 ^TWII 會整天漏資料、成交量也不對，所以不用。今天的成交量收盤後抓 FMTQIK，盤中先用 MIS 估算。
 */
let fmtqik: { at: number; v: Record<string, [number, number]> } | null = null;
async function monthVolume(): Promise<Record<string, [number, number]>> {
  if (fmtqik && Date.now() - fmtqik.at < 10 * 60_000) return fmtqik.v;
  const v: Record<string, [number, number]> = {};
  try {
    const d8 = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
    const r = await fetch(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${d8}&response=json`, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    const j = (await r.json()) as { data?: string[][] };
    const num = (s: string) => Number(String(s).replace(/,/g, ""));
    for (const row of j.data ?? []) {
      const [y, m, dd] = row[0].split("/").map(Number);
      v[`${y + 1911}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`] = [Math.round(num(row[1]) / 1000), Math.round(num(row[2]) / 1e6) / 100];
    }
  } catch {}
  fmtqik = { at: Date.now(), v };
  return v;
}
let volStore: { at: number; v: Record<string, [number, number]> } | null = null;
function storedVolume() {
  if (volStore && Date.now() - volStore.at < 10 * 60_000) return volStore.v;
  const f = path.join(process.cwd(), "data", "taiex-vol.json");
  volStore = { at: Date.now(), v: existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {} };
  return volStore.v;
}

export async function taiexDaily(): Promise<Bar[]> {
  const raw = load("tse").bars["發行量加權股價指數"] ?? [];
  const vol = { ...storedVolume(), ...(await monthVolume()) };
  const bars: Bar[] = raw.map(([d, o, h, l, c]) => ({ time: Date.parse(d) / 1000, open: o, high: h, low: l, close: c, volume: vol[d]?.[0] ?? 0 }));
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const t = Date.parse(today) / 1000;
  if (!bars.length || bars[bars.length - 1].time < t) {
    const [q] = await getQuotes(["tse_t00.tw"]);
    const day = q ? new Date(q.time + 8 * 3600e3).toISOString().slice(0, 10) : "";
    if (q?.price && day === today) {
      const o = await misOhlc("TSE");
      // MIS 的 tv 單位是張（成交金額 ÷ tv ≈ 每張 6 萬元＝均價 60 元左右），只含一般交易（收盤後會被官方數字取代）
      bars.push({ time: t, open: q.open || q.prev, high: q.high || q.price, low: q.low || q.price, close: q.price, volume: vol[today]?.[0] ?? Math.round(o.orders?.vol ?? 0) });
    }
  }
  return bars;
}
