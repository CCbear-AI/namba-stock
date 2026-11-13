// 類股指數：歷史日 K（data/sector-tse.json、data/sector-otc.json）＋ MIS 即時
import { readFileSync, existsSync } from "node:fs";
import { load, historyKey } from "./indexHist";
import path from "node:path";
import { getQuotes } from "./mis";
import { misOhlc } from "./misStats";
import { getDaily } from "./history";
import { UNIVERSE } from "./universe";
import { getMarket } from "./market";
import type { Bar } from "./types";

// MIS 類股指數代號與名稱（2026-11-13 從 MIS 取得；t19、o01~o03 等代號不存在）
const SECTORS: [string, string][] = [["t01","水泥類指數"],["t02","食品類指數"],["t03","塑膠類指數"],["t04","紡織纖維類指數"],["t05","電機機械類指數"],["t06","電器電纜類指數"],["t07","化學生技醫療類指數"],["t08","玻璃陶瓷類指數"],["t09","造紙類指數"],["t10","鋼鐵類指數"],["t11","橡膠類指數"],["t12","汽車類指數"],["t13","電子工業類指數"],["t14","建材營造類指數"],["t15","航運類指數"],["t16","觀光餐旅類指數"],["t17","金融保險類指數"],["t18","貿易百貨類指數"],["t20","其他類指數"],["t21","化學類指數"],["t22","生技醫療類指數"],["t23","油電燃氣類指數"],["t24","半導體類指數"],["t25","電腦及週邊設備類指數"],["t26","光電類指數"],["t27","通信網路類指數"],["t28","電子零組件類指數"],["t29","電子通路類指數"],["t30","資訊服務類指數"],["t31","其他電子類指數"],["o00","櫃買指數"],["o04","櫃買紡纖類指數"],["o05","櫃買機械類指數"],["o10","櫃買鋼鐵類指數"],["o13","櫃買電子類指數"],["o14","櫃買營建類指數"],["o15","櫃買航運類指數"],["o16","櫃買觀光餐旅類指數"],["o20","櫃買其他類指數"],["o21","櫃買化工類指數"],["o22","櫃買生技醫療類指數"],["o24","櫃買半導體類指數"],["o25","櫃買電腦及週邊類指數"],["o26","櫃買光電業類指數"],["o27","櫃買通信網路類指數"],["o28","櫃買電子零組件類指數"],["o29","櫃買電子通路類指數"],["o30","櫃買資訊服務類指數"],["o31","櫃買其他電子類指數"],["o32","櫃買文化創意業類指數"]];
const CODES = SECTORS.map(([c]) => `${c.startsWith("o") ? "otc" : "tse"}_${c}.tw`);

export type SectorQuote = { id: string; name: string; short: string; market: "tse" | "otc"; price: number; prev: number; pct: number; hasHistory: boolean; stale?: string /* 抓不到即時時：用的是哪天收盤 */ };

let live: { at: number; list: SectorQuote[] } | null = null;

const toQuote = (id: string, name: string, price: number, prev: number): SectorQuote => {
  const market = id.startsWith("o") ? "otc" : "tse";
  const short = name.replace(/^櫃買/, "").replace(/類指數$/, "").replace(/業$/, "");
  return { id, name, short, market, price, prev, pct: prev ? Math.round(((price - prev) / prev) * 10000) / 100 : 0, hasHistory: Boolean(historyKey(name, market)) };
};

/** 證交所 MIS 抓不到時（短時間問太多次會回空白）：用官方類股日 K 最後一天收盤 */
function fromHistory(): SectorQuote[] {
  const out: SectorQuote[] = [];
  for (const [id, name] of SECTORS) {
    const market = id.startsWith("o") ? "otc" : "tse";
    const key = historyKey(name, market);
    const bars = key ? load(market).bars[key] : null;
    if (!bars || bars.length < 2) continue;
    out.push({ ...toQuote(id, name, bars[bars.length - 1][4], bars[bars.length - 2][4]), stale: bars[bars.length - 1][0] });
  }
  return out;
}

export async function sectorQuotes(): Promise<SectorQuote[]> {
  if (live && Date.now() - live.at < 15_000) return live.list;
  let qs = (await getQuotes(CODES)).filter((q) => q.price > 0);
  if (!qs.length) {
    // MIS 偶爾回空白（限流），等一下再試一次
    await new Promise((r) => setTimeout(r, 1500));
    qs = (await getQuotes(CODES, 8_000)).filter((q) => q.price > 0);
  }
  if (!qs.length) {
    // 還是沒有：沿用上一次成功的資料，再沒有就用官方收盤；不更新 at，下次請求會再試
    return live?.list.length ? live.list : fromHistory();
  }
  const list = qs.map((q) => toQuote(q.c, q.n, q.price, q.prev));
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
  if (q.price && !q.stale && (!bars.length || bars[bars.length - 1].time < t)) {
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
    const r = await fetch(`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_INDEX?date=${today.replace(/-/g, "")}&response=json`, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
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
    const r = await fetch(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${d8}&response=json`, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
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
