// 全市場快照（伺服器記憶體快取 15 秒）
import { getQuotes, ch, type Quote } from "./mis";
import { UNIVERSE, BY_CODE } from "./universe";
import type { Market, Row, IndexQuote } from "./types";
import { getDaily, lastIdx } from "./history";

const INDEX_CH = ["tse_t00.tw", "otc_o00.tw", "tse_0050.tw"];
let cache: { at: number; data: Market } | null = null;
// 每檔最後一次抓到的資料：某一批抓失敗時先沿用，避免股票整批從清單消失
const lastRow = new Map<string, Row>();
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
    bid1: q.bid[0] ?? 0, ask1: q.ask[0] ?? 0, bv: q.bidV[0] ?? 0, av: q.askV[0] ?? 0,
  };
}

/** 台灣時間是否在盤中（週一到五 9:00–13:30） */
export function isTradingNow() {
  const d = new Date(Date.now() + 8 * 3600e3);
  const wd = d.getUTCDay();
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return wd >= 1 && wd <= 5 && m >= 9 * 60 && m <= 13 * 60 + 35;
}

/** 即時報價完全抓不到時（例如被證交所暫時擋住），改用最近一天的收盤日 K 撐著 */
function fromDaily(): Market {
  const { dates, s } = getDaily();
  const stocks: Row[] = [];
  for (const u of UNIVERSE) {
    const x = s.get(u.c);
    if (!x) continue;
    const i = lastIdx(x.c), p = i > 0 ? lastIdx(x.c, i - 1) : -1;
    if (i < 0 || p < 0) continue;
    const prev = x.c[p], price = x.c[i], chg = price - prev;
    // 漲跌停價依台股升降單位：漲停往下取、跌停往上取
    const tick = (v: number) => (v >= 1000 ? 5 : v >= 500 ? 1 : v >= 100 ? 0.5 : v >= 50 ? 0.1 : v >= 10 ? 0.05 : 0.01);
    const lim = (k: number) => { const v = prev * k, t = tick(v), n = v / t; return Math.round((k > 1 ? Math.floor(n + 1e-9) : Math.ceil(n - 1e-9)) * t * 100) / 100; };
    stocks.push({
      c: u.c, n: u.n, m: u.m, ind: u.ind, price, prev, chg: r2(chg), pct: r2((chg / prev) * 100),
      open: x.o[i], high: x.h[i], low: x.l[i], vol: x.v[i], value: r2(x.val[i] / 100), cap: Math.round((u.sh * price) / 1e8),
      up: lim(1.1), down: lim(0.9), bid1: price, ask1: 0, bv: 0, av: 0,
    });
  }
  const b = { up: 0, flat: 0, down: 0, limitUp: 0, limitDown: 0, value: 0 };
  for (const r of stocks) {
    if (r.chg > 0) b.up++; else if (r.chg < 0) b.down++; else b.flat++;
    if (r.price >= r.up) b.limitUp++; else if (r.price <= r.down) b.limitDown++;
    b.value += r.value;
  }
  b.value = Math.round(b.value);
  const t = Date.parse(`${dates.at(-1)}T13:30:00+08:00`);
  return { time: t, open: false, indices: [], stocks, breadth: b, stale: true };
}

async function load(): Promise<Market> {
  const list = await getQuotes([...INDEX_CH, ...UNIVERSE.map((s) => ch(s.m, s.c))]);
  if (list.length < 50 && !lastRow.size) return fromDaily();
  const indices: IndexQuote[] = [];
  const stocks: Row[] = [];
  for (const q of list) {
    if (q.c === "t00" || q.c === "o00" || q.c === "0050") indices.push(toIndex(q));
    else { const r = toRow(q); if (r) { stocks.push(r); lastRow.set(r.c, r); } }
  }
  if (stocks.length < UNIVERSE.length) {
    const have = new Set(stocks.map((r) => r.c));
    for (const [c, r] of lastRow) if (!have.has(c)) stocks.push(r);
    stocks.sort((a, b) => a.c.localeCompare(b.c));
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
  // 報價抓不到（顯示的是收盤資料）時隔 1 分鐘再試，免得每次都卡在逾時
  const ttl = cache?.data.stale ? 60_000 : isTradingNow() ? 15_000 : 120_000;
  if (cache && Date.now() - cache.at < ttl) return cache.data;
  pending ??= load().then((data) => { cache = { at: Date.now(), data }; return data; }).finally(() => { pending = null; });
  return pending;
}
