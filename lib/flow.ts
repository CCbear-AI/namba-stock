// 即時資金流：用相鄰兩次快照的成交量差，判斷這段成交是外盤（主動買）還是內盤（主動賣）
import type { Quote } from "./mis";

/** 每檔股票的累積狀態 */
export type StockFlow = {
  vol: number; // 上次快照的累積量（張）
  ask1: number;
  bid1: number;
  price: number;
  buy: number; // 累積外盤金額（元）
  sell: number; // 累積內盤金額（元）
  value: number; // 累積成交金額（元）
};

/** 一個時間點：每個板塊 [主動買賣淨額(億), 成交值(億), 漲跌幅%] */
export type FlowPoint = { t: string; s: Record<string, [number, number, number]> };

/** 一天的完整紀錄 */
export type FlowDay = {
  date: string;
  points: FlowPoint[];
  /** 最新快照的個股全天累積：代號 → [淨額(億), 成交值(億), 漲跌幅%] */
  stocks: Record<string, [number, number, number]>;
  updated: number;
  /** 上市委買／委賣張數：[時間, 委買, 委賣] */
  orders?: [string, number, number][];
  /** 盤中動態（最新在後） */
  events?: FlowEvent[];
  /** 漲跌停追蹤：代號 → { 首次漲停時間, 打開次數, 首次跌停時間 } */
  limits?: Record<string, { up?: string; upOpen?: number; dn?: string; dnOpen?: number }>;
};

export type FlowEvent = { t: string; c: string; n: string; k: "lockUp" | "openUp" | "lockDn" | "openDn" | "rvol"; msg: string };

export function updateStock(st: StockFlow | undefined, q: Quote): StockFlow {
  if (!st) {
    // 第一次看到：之前的成交無法判斷方向，只記成交值，內外盤各半
    const value = q.vol * 1000 * q.price;
    return { vol: q.vol, ask1: q.ask[0] ?? 0, bid1: q.bid[0] ?? 0, price: q.price, buy: value / 2, sell: value / 2, value };
  }
  const dv = q.vol - st.vol;
  const next = { ...st, ask1: q.ask[0] ?? 0, bid1: q.bid[0] ?? 0, price: q.price, vol: Math.max(q.vol, st.vol) };
  if (dv <= 0 || !q.price) return next;
  const amt = dv * 1000 * q.price;
  next.value += amt;
  let dir = 0; // 1 外盤 -1 內盤 0 不明
  if (st.ask1 > 0 && q.price >= st.ask1) dir = 1;
  else if (st.bid1 > 0 && q.price <= st.bid1) dir = -1;
  else if (!st.ask1 && q.up && q.price >= q.up) dir = 1; // 漲停鎖住，賣盤空
  else if (!st.bid1 && q.down && q.price <= q.down) dir = -1; // 跌停鎖住
  else if (q.price > st.price) dir = 1;
  else if (q.price < st.price) dir = -1;
  if (dir > 0) next.buy += amt;
  else if (dir < 0) next.sell += amt;
  else { next.buy += amt / 2; next.sell += amt / 2; }
  return next;
}

const yi = (v: number) => Math.round(v / 1e6) / 100; // 元 → 億，留兩位

export function makePoint(
  t: string,
  state: Map<string, StockFlow>,
  quotes: Map<string, Quote>,
  meta: Map<string, { ind: string; sh: number }>,
): { point: FlowPoint; stocks: FlowDay["stocks"] } {
  const agg: Record<string, { net: number; value: number; cap: number; capChg: number }> = {};
  const stocks: FlowDay["stocks"] = {};
  for (const [c, st] of state) {
    const m = meta.get(c);
    const q = quotes.get(c);
    if (!m || !q || !q.prev) continue;
    const pct = ((q.price - q.prev) / q.prev) * 100;
    const a = (agg[m.ind] ??= { net: 0, value: 0, cap: 0, capChg: 0 });
    const cap = m.sh * q.prev;
    a.net += st.buy - st.sell;
    a.value += st.value;
    a.cap += cap;
    a.capChg += cap * pct;
    stocks[c] = [yi(st.buy - st.sell), yi(st.value), Math.round(pct * 100) / 100];
  }
  const s: FlowPoint["s"] = {};
  for (const [ind, a] of Object.entries(agg)) {
    s[ind] = [yi(a.net), yi(a.value), a.cap ? Math.round((a.capChg / a.cap) * 100) / 100 : 0];
  }
  return { point: { t, s }, stocks };
}
