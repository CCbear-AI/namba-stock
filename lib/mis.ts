// 證交所基本市況報導（MIS）即時報價。一次最多查 100 檔，依序查才不會被限速。
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(x: any): Quote {
  const bid = arr(x.b), ask = arr(x.a);
  const prev = n(x.y);
  let price = n(x.z);
  if (!price) price = n(x.pz) || (bid[0] && ask[0] ? (bid[0] + ask[0]) / 2 : bid[0] || ask[0] || prev);
  return {
    c: x.c, n: x.n, m: x.ex === "otc" ? "otc" : "tse",
    price, prev,
    open: n(x.o) || price, high: n(x.h) || price, low: n(x.l) || price,
    vol: x.v !== undefined ? n(x.v) : n(x.m) / 1e6 /* 指數：成交金額 → 百萬 */,
    tickVol: n(x.tv),
    ask, askV: arr(x.f), bid, bidV: arr(x.g),
    up: n(x.u), down: n(x.w),
    time: n(x.tlong) || Date.now(),
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
export async function getQuotes(chs: string[], budgetMs = 25_000): Promise<Quote[]> {
  const out: Quote[] = [];
  const deadline = Date.now() + budgetMs;
  for (let i = 0; i < chs.length; i += 100) {
    const part = chs.slice(i, i + 100);
    let res: Quote[] | null = null;
    // 超過時間預算就不再重試，避免一輪拖太久（漏掉的下一輪會補上成交量差）
    for (let k = 0; k < 4 && !res && (k === 0 || Date.now() < deadline); k++) res = await fetchBatch(part);
    if (res) out.push(...res);
  }
  return out;
}

export const ch = (m: "tse" | "otc", c: string) => `${m}_${c}.tw`;
