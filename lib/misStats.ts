// MIS 大盤統計：委買委賣張數／筆數、每分鐘指數與成交量（量能曲線）
// 來源：mis.twse.com.tw/stock/data/mis_ohlc_TSE.txt（證交所基本市況報導網站首頁用的公開資料檔）
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type Orders = { bidLots: number; bidCnt: number; askLots: number; askCnt: number; vol: number; trades: number; value: number };
export type MisOhlc = { orders: Orders | null; minutes: { t: number; c: number; v: number }[] };

const n = (s: unknown) => Number(s) || 0;
const cache = new Map<string, { at: number; v: MisOhlc }>();

export async function misOhlc(ex: "TSE" | "OTC" = "TSE"): Promise<MisOhlc> {
  const hit = cache.get(ex);
  if (hit && Date.now() - hit.at < 15_000) return hit.v;
  try {
    const r = await fetch(`https://mis.twse.com.tw/stock/data/mis_ohlc_${ex}.txt?_=${Date.now()}`, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    const j = await r.json();
    const o = j.staticObj;
    const v: MisOhlc = {
      orders: o ? { bidLots: n(o.t4), bidCnt: n(o.t2), askLots: n(o.t3), askCnt: n(o.t1), vol: n(o.tv), trades: n(o.tr), value: n(o.tz) / 1e8 } : null,
      minutes: (j.ohlcArray ?? []).map((x: Record<string, string>) => ({ t: n(x.t), c: n(x.c), v: n(x.s) })),
    };
    cache.set(ex, { at: Date.now(), v });
    return v;
  } catch {
    return hit?.v ?? { orders: null, minutes: [] };
  }
}

// 台股一般交易日的累積成交量比例（每 15 分鐘），沒有 data/volcurve.json 時用這個
const DEFAULT_CURVE: [number, number][] = [
  [540, 0], [541, 0.06], [545, 0.1], [555, 0.17], [570, 0.25], [585, 0.31], [600, 0.37], [615, 0.42], [630, 0.47], [645, 0.51],
  [660, 0.55], [675, 0.59], [690, 0.62], [705, 0.66], [720, 0.69], [735, 0.72], [750, 0.76], [765, 0.79], [780, 0.83], [795, 0.87], [805, 0.91], [810, 1],
];

let curve: { at: number; pts: [number, number][] } | null = null;
function loadCurve(): [number, number][] {
  if (curve && Date.now() - curve.at < 3600e3) return curve.pts;
  const f = path.join(process.cwd(), "data", "volcurve.json");
  const pts = existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")).pts as [number, number][]) : DEFAULT_CURVE;
  curve = { at: Date.now(), pts };
  return pts;
}

/** 到這個時間（台灣時間的「當天第幾分鐘」）平常會累積到全天量的幾成；收盤後 = 1 */
export function volFraction(minuteOfDay: number) {
  const pts = loadCurve();
  if (minuteOfDay <= pts[0][0]) return 0.03;
  for (let i = 1; i < pts.length; i++) {
    const [m1, f1] = pts[i];
    if (minuteOfDay <= m1) {
      const [m0, f0] = pts[i - 1];
      return Math.max(0.03, f0 + ((f1 - f0) * (minuteOfDay - m0)) / (m1 - m0 || 1));
    }
  }
  return 1;
}
