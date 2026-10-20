// 類股指數：歷史日 K（data/sector-tse.json）＋ MIS 即時
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getQuotes } from "./mis";
import type { Bar } from "./types";

type Store = { bars: Record<string, [string, number, number, number, number][]> };
let store: { at: number; s: Store } | null = null;

function load(): Store {
  if (store && Date.now() - store.at < 10 * 60_000) return store.s;
  const f = path.join(process.cwd(), "data", "sector-tse.json");
  const s: Store = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { bars: {} };
  store = { at: Date.now(), s };
  return s;
}

const TSE_CODES = Array.from({ length: 31 }, (_, i) => `tse_t${String(i + 1).padStart(2, "0")}.tw`);
const OTC_CODES = Array.from({ length: 32 }, (_, i) => `otc_o${String(i + 1).padStart(2, "0")}.tw`);

export type SectorQuote = { id: string; name: string; short: string; market: "tse" | "otc"; price: number; prev: number; pct: number; hasHistory: boolean };

let live: { at: number; list: SectorQuote[] } | null = null;

export async function sectorQuotes(): Promise<SectorQuote[]> {
  if (live && Date.now() - live.at < 15_000) return live.list;
  const s = load();
  const qs = await getQuotes([...TSE_CODES, ...OTC_CODES]);
  const list = qs
    .filter((q) => q.price > 0)
    .map((q) => {
      const market = q.c.startsWith("o") ? "otc" : "tse";
      const short = q.n.replace(/^櫃買/, "").replace(/類指數$/, "").replace(/業$/, "");
      return {
        id: q.c, name: q.n, short, market,
        price: q.price, prev: q.prev, pct: q.prev ? Math.round(((q.price - q.prev) / q.prev) * 10000) / 100 : 0,
        hasHistory: market === "tse" && Boolean(s.bars[q.n]),
      } as SectorQuote;
    });
  live = { at: Date.now(), list };
  return list;
}

/** 類股日 K；最後一天沒有的話用即時報價補一根 */
export async function sectorDaily(id: string): Promise<Bar[]> {
  const list = await sectorQuotes();
  const q = list.find((x) => x.id === id);
  if (!q) return [];
  const raw = load().bars[q.name] ?? [];
  const bars: Bar[] = raw.map(([d, o, h, l, c]) => ({ time: Date.parse(d) / 1000, open: o, high: h, low: l, close: c, volume: 0 }));
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const t = Date.parse(today) / 1000;
  if (q.price && (!bars.length || bars[bars.length - 1].time < t)) {
    const wd = new Date(t * 1000).getUTCDay();
    if (wd >= 1 && wd <= 5) bars.push({ time: t, open: q.prev, high: Math.max(q.prev, q.price), low: Math.min(q.prev, q.price), close: q.price, volume: 0 });
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
