// 證交所基本市況報導（MIS）即時報價。一次最多查 100 檔，依序查才不會被限速。
import { getDaily } from "./history";
export type Quote = {
  c: string; // 代號
  n: string; // 名稱
  m: "tse" | "otc";
  price: number; // 最新成交價（沒成交時用參考值）
  prev: number; // 昨收
  open: number;
  high: number;
  low: number;
  vol: number; // 累積成交量（張；指數為成交金額百萬）
  tickVol: number; // 最近一筆成交量
  /** 這一刻 MIS 沒給成交價，price 是推估的（全市場快照會再用 Yahoo 成交價補） */
  est?: boolean;
  ask: number[];
  askV: number[];
  bid: number[];
  bidV: number[];
  up: number; // 漲停價
  down: number; // 跌停價
  time: number; // 資料時間 ms
};

const BASE = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp";
const n = (s?: string) => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};
const arr = (s?: string) => (s ? s.split("_").map(Number).filter((v) => Number.isFinite(v) && v > 0) : []);

// 這一刻沒有成交（z 是 "-"，冷門股收盤常見）時，不能拿買賣價中間值當成交價，否則漲平跌會判錯：
// 依序用 當天盤後日 K 收盤價 → 這台主機之前抓到的最後成交價 → 只成交一種價格時的最高價
const lastTrade = new Map<string, number>();
function noTradePrice(c: string, time: number, high: number, low: number) {
  const { dates, s } = getDaily();
  const i = dates.length - 1;
  if (dates[i] === new Date(time + 8 * 3600e3).toISOString().slice(0, 10)) {
    const close = s.get(c)?.c[i];
    if (close) return close;
  }
  return lastTrade.get(c) || (high && high === low ? high : 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(x: any): Quote {
  const bid = arr(x.b), ask = arr(x.a);
  const prev = n(x.y);
  const time = n(x.tlong) || Date.now();
  const high = n(x.h), low = n(x.l);
  // 個股今天還沒成交（量 0）：8:30～9:00 的 z 是試撮價（常掛在漲跌停），不能當成交價也不能記成最後成交 → 用昨收（算平盤）
  const noTradeYet = x.v !== undefined && !n(x.v);
  let price = noTradeYet ? 0 : n(x.z) || n(x.pz);
  const est = !price && !noTradeYet;
  if (price) lastTrade.set(x.c, price);
  else if (noTradeYet) price = prev;
  else {
    price = noTradePrice(x.c, time, high, low);
    if (!price) {
      // 最後退路：買賣價中間值，但限制在今天的最高、最低之間
      const mid = bid[0] && ask[0] ? (bid[0] + ask[0]) / 2 : bid[0] || ask[0] || prev;
      price = high && low ? Math.min(high, Math.max(low, mid)) : mid;
    }
  }
  return {
    c: x.c, n: x.n, m: x.ex === "otc" ? "otc" : "tse",
    price, prev,
    open: n(x.o) || price, high: n(x.h) || price, low: n(x.l) || price,
    vol: x.v !== undefined ? n(x.v) : n(x.m) / 1e6 /* 指數：成交金額 → 百萬 */,
    tickVol: n(x.tv),
    ...(est ? { est } : {}),
    ask, askV: arr(x.f), bid, bidV: arr(x.g),
    up: n(x.u), down: n(x.w),
    time,
  };
}

async function fetchBatch(chs: string[], timeout = 3000): Promise<Quote[] | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${BASE}?json=1&delay=0&ex_ch=${encodeURIComponent(chs.join("|"))}`, {
      signal: ctl.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    const j = await r.json();
    if (!Array.isArray(j.msgArray)) return null;
    return j.msgArray.filter((x: { c?: string }) => x.c).map(parse);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** chs 形如 "tse_2330.tw"、"otc_6488.tw"、"tse_t00.tw" */
export async function getQuotes(chs: string[], budgetMs = 35_000): Promise<Quote[]> {
  const out: Quote[] = [];
  const failed: string[][] = [];
  const deadline = Date.now() + budgetMs;
  for (let i = 0; i < chs.length; i += 100) {
    const part = chs.slice(i, i + 100);
    let res: Quote[] | null = null;
    // 超過時間預算就不再重試，避免一輪拖太久
    for (let k = 0; k < 3 && !res && (k === 0 || Date.now() < deadline); k++) res = await fetchBatch(part, 4000);
    if (res) out.push(...res); else failed.push(part);
  }
  // 失敗的批次最後再補抓一次（證交所偶爾某一批回得很慢）
  for (const part of failed) {
    if (Date.now() > deadline + 10_000) break;
    const res = await fetchBatch(part, 6000);
    if (res) out.push(...res);
  }
  return out;
}

export const ch = (m: "tse" | "otc", c: string) => `${m}_${c}.tw`;
