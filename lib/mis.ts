// 證交所基本市況報導（MIS）即時報價。一次最多查 100 檔，依序查才不會被限速。
import { getDaily } from "./history";
import { load, historyKey } from "./indexHist";
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

// 盤後 MIS 的開高低有時是錯的（例：2026-11-06 台積電 MIS 給 開2135 高2140 低2130，官方是 2020/2195/2020），
// 所以當天官方日 K 進來後，開高低一律以官方為準
function officialOhl(c: string, time: number): [number, number, number] | null {
  const { dates, s } = getDaily();
  const i = dates.length - 1;
  if (dates[i] !== new Date(time + 8 * 3600e3).toISOString().slice(0, 10)) return null;
  const x = s.get(c);
  const o = x?.o[i], h = x?.h[i], l = x?.l[i];
  return o && h && l ? [o, h, l] : null;
}

const twDate = (ms: number) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
const tickOf = (p: number) => (p >= 1000 ? 5 : p >= 500 ? 1 : p >= 100 ? 0.5 : p >= 50 ? 0.1 : p >= 10 ? 0.05 : 0.01);
/** 漲跌停價（±10%，漲停往下、跌停往上取到升降單位） */
function limits(prev: number): [number, number] {
  if (!prev) return [0, 0];
  const u = prev * 1.1, d = prev * 0.9, tu = tickOf(u), td = tickOf(d);
  const r = (v: number) => Math.round(v * 100) / 100;
  return [r(Math.floor(u / tu + 1e-9) * tu), r(Math.ceil(d / td - 1e-9) * td)];
}

/**
 * 證交所週末會做系統測試，MIS 放出「假的下一個交易日」報價（例：2026-11-08 週日 台積電 2150、成交 1,287 張）。
 * 週六日的報價一律不採用，改回最後一個官方交易日的收盤（個股用官方日 K，指數用指數歷史），
 * 時間也改成那天 13:30，K 線就不會多出一根週末的假 K 棒。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function weekendQuote(x: any, time: number): Quote | null {
  const wd = new Date(time + 8 * 3600e3).getUTCDay();
  if (wd !== 0 && wd !== 6) return null;
  const market: "tse" | "otc" = x.ex === "otc" ? "otc" : "tse";
  const { dates, s } = getDaily();
  const i = dates.length - 1;
  const st = s.get(x.c);
  let bar: { d: string; o: number; h: number; l: number; c: number; v: number; prev: number } | null = null;
  if (st && st.c[i] > 0) {
    let j = i - 1;
    while (j >= 0 && !(st.c[j] > 0)) j--;
    bar = { d: dates[i], o: st.o[i], h: st.h[i], l: st.l[i], c: st.c[i], v: st.v[i], prev: j >= 0 ? st.c[j] : n(x.y) };
  } else if (!st) {
    // 指數（加權、櫃買、類股）
    const key = historyKey(x.n ?? "", market);
    const rows = key ? load(market).bars[key] : null;
    const k = rows ? rows.length - 1 : -1;
    if (rows && k >= 1) bar = { d: rows[k][0], o: rows[k][1], h: rows[k][2], l: rows[k][3], c: rows[k][4], v: 0, prev: rows[k - 1][4] };
  }
  // 找不到官方資料：用昨收（＝最後一個交易日收盤），不顯示測試價
  if (!bar) { const y = n(x.y); bar = { d: dates[i] ?? twDate(time), o: y, h: y, l: y, c: y, v: 0, prev: y }; }
  const isIndex = !st && x.v === undefined;
  const [up, down] = isIndex ? [0, 0] : limits(bar.prev);
  return {
    c: x.c, n: x.n, m: market,
    price: bar.c, prev: bar.prev, open: bar.o, high: bar.h, low: bar.l,
    vol: bar.v, tickVol: 0,
    ask: [], askV: [], bid: [], bidV: [],
    up, down,
    time: Date.parse(`${bar.d}T13:30:00+08:00`),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(x: any): Quote {
  const bid = arr(x.b), ask = arr(x.a);
  const prev = n(x.y);
  const time = n(x.tlong) || Date.now();
  const wk = weekendQuote(x, time);
  if (wk) return wk;
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
  let off = officialOhl(x.c, time);
  let closeTime = time;
  // 指數：MIS 收盤後常停在 13:19 左右的數字（例 11/6 加權 39,690.74，官方收盤 39,701.64）
  // → 官方指數日 K 進來後，開高低收一律用官方，才會跟 K 線一致
  if (x.v === undefined) {
    const market: "tse" | "otc" = x.ex === "otc" ? "otc" : "tse";
    const key = historyKey(x.n ?? "", market);
    const row = key ? load(market).bars[key]?.at(-1) : null;
    if (row && row[0] === twDate(time) && row[4] > 0) { price = row[4]; off = [row[1], row[2], row[3]]; closeTime = Date.parse(`${row[0]}T13:30:00+08:00`); }
  }
  return {
    c: x.c, n: x.n, m: x.ex === "otc" ? "otc" : "tse",
    price, prev,
    open: off?.[0] || n(x.o) || price, high: off?.[1] || high || price, low: off?.[2] || low || price,
    vol: x.v !== undefined ? n(x.v) : n(x.m) / 1e6 /* 指數：成交金額 → 百萬 */,
    tickVol: n(x.tv),
    ...(est ? { est } : {}),
    ask, askV: arr(x.f), bid, bidV: arr(x.g),
    up: n(x.u), down: n(x.w),
    time: closeTime,
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
