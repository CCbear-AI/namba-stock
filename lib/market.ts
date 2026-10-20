// 全市場快照（伺服器記憶體快取 15 秒）
import { getQuotes, ch, type Quote } from "./mis";
import { UNIVERSE, BY_CODE } from "./universe";
import type { Market, Row, IndexQuote } from "./types";

const INDEX_CH = ["tse_t00.tw", "otc_o00.tw", "tse_0050.tw"];
let cache: { at: number; data: Market } | null = null;
let pending: Promise<Market> | null = null;

const r2 = (v: number) => Math.round(v * 100) / 100;

export function toIndex(q: Quote): IndexQuote {
  const chg = q.prev ? q.price - q.prev : 0;
  return { c: q.c, n: q.n, price: q.price, prev: q.prev, chg: r2(chg), pct: q.prev ? r2((chg / q.prev) * 100) : 0, high: q.high, low: q.low, open: q.open };
}

export function toRow(q: Quote): Row | null {
  const s = BY_CODE.get(q.c);
  if (!s) return null;
  const chg = q.prev ? q.price - q.prev : 0;
  // MIS 沒有成交金額，用 成交量 × 均價（開高低收平均）估算
  const avg = (q.open + q.high + q.low + q.price) / 4 || q.price;
  return {
    c: q.c, n: s.n, m: s.m, ind: s.ind,
    price: q.price, prev: q.prev, chg: r2(chg), pct: q.prev ? r2((chg / q.prev) * 100) : 0,
    open: q.open, high: q.high, low: q.low, vol: q.vol,
    value: r2((q.vol * 1000 * avg) / 1e8),
    cap: Math.round((s.sh * q.price) / 1e8),
    up: q.up, down: q.down,
  };
}

/** 台灣時間是否在盤中（週一到五 9:00–13:30） */
export function isTradingNow() {
  const d = new Date(Date.now() + 8 * 3600e3);
  const wd = d.getUTCDay();
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return wd >= 1 && wd <= 5 && m >= 9 * 60 && m <= 13 * 60 + 35;
}

async function load(): Promise<Market> {
  const list = await getQuotes([...INDEX_CH, ...UNIVERSE.map((s) => ch(s.m, s.c))]);
  const indices: IndexQuote[] = [];
  const stocks: Row[] = [];
  for (const q of list) {
    if (q.c === "t00" || q.c === "o00" || q.c === "0050") indices.push(toIndex(q));
    else { const r = toRow(q); if (r) stocks.push(r); }
  }
  const b = { up: 0, flat: 0, down: 0, limitUp: 0, limitDown: 0, value: 0 };
  for (const s of stocks) {
    if (!s.vol) continue;
    if (s.chg > 0) b.up++; else if (s.chg < 0) b.down++; else b.flat++;
    if (s.up && s.price >= s.up) b.limitUp++;
    if (s.down && s.price <= s.down) b.limitDown++;
    b.value += s.value;
  }
  b.value = Math.round(b.value);
  // 用加權指數的時間（個股盤後零股會到 14:30）
  const t00 = list.find((q) => q.c === "t00");
  return { time: t00?.time ?? Math.max(0, ...list.map((q) => q.time)), open: isTradingNow(), indices, stocks, breadth: b };
}

export async function getMarket(): Promise<Market> {
  const ttl = isTradingNow() ? 15_000 : 120_000;
  if (cache && Date.now() - cache.at < ttl) return cache.data;
  pending ??= load().then((data) => { cache = { at: Date.now(), data }; return data; }).finally(() => { pending = null; });
  return pending;
}
