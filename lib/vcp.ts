// VCP 波動收縮（Minervini）：趨勢樣板＋三段回檔逐段變淺＋量縮，收盤放量突破樞紐點
// 照網路分享的 XQ 腳本「02_VCP突破_警示」邏輯自己重寫（預設參數相同）：
//   趨勢：收盤 > 50/150/200 日線、150 > 200、200 日線比 20 天前高、50 > 150 且 50 > 200、
//         收盤 ≥ 52 週低 × 1.3、收盤在 52 週高 25% 以內
//   收縮：突破前 75 天切三段（每段 25 天，不含今天），(高−低)÷高：第一段 ≥ 10%、逐段變淺、最後一段 ≤ 10%
//   量縮：昨天為止 10 日均量 < 50 日均量 × 0.7
//   相對強度：250 日漲幅 ≥ 加權指數 250 日漲幅
//   突破：收盤由下往上穿過樞紐點（最後一段最高價）且今日量 > 50 日均量 × 1.5、量 ≥ 500 張
// 「整理中」是我們加的：除了突破那條，其他都符合、收盤還在樞紐點以下（50 日均量 ≥ 500 張）

export const VCP = { seg: 25, maxLast: 10, minFirst: 10, dry: 0.7, brk: 1.5, minVol: 500, lowMult: 1.3, highPct: 25, upBars: 20 };

export type VcpBar = { date: string; h: number; l: number; c: number; v: number };
export type VcpResult = {
  state: 0 | 1 | 2; // 0 不符合、1 整理中、2 今日突破
  pivot: number; // 樞紐點＝最後一段最高價
  d: [number, number, number]; // 三段收縮幅度 %
  dry: number; // 10 日均量 ÷ 50 日均量（到昨天）
  vr50: number; // 今日量 ÷ 50 日均量
};

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const hi = (a: VcpBar[]) => Math.max(...a.map((b) => b.h));
const lo = (a: VcpBar[]) => Math.min(...a.map((b) => b.l));
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * bars：由舊到新的日K，最後一根＝今天（盤中用現價）；只放有成交的日子
 * idxClose：加權指數 日期→收盤；idxToday：今天的加權指數（盤中用即時）
 */
export function vcp(bars: VcpBar[], idxClose: Map<string, number>, idxToday: number): VcpResult | null {
  const n = bars.length, T = n - 1, S = VCP.seg;
  if (n < 260 || n <= 3 * S + 1) return null;
  const c = bars.map((b) => b.c);
  const ma = (len: number, end = T) => avg(c.slice(end - len + 1, end + 1));
  const ma50 = ma(50), ma150 = ma(150), ma200 = ma(200), ma200ago = ma(200, T - VCP.upBars);
  const last250 = bars.slice(n - 250);
  const low52 = lo(last250), high52 = hi(last250);
  const px = c[T];
  const trend = px > ma150 && px > ma200 && ma150 > ma200 && ma200 > ma200ago && ma50 > ma150 && ma50 > ma200 && px > ma50
    && low52 > 0 && px >= low52 * VCP.lowMult && high52 > 0 && px >= high52 * (1 - VCP.highPct / 100);
  if (!trend) return null;

  const seg = (k: number) => bars.slice(T - k * S, T - (k - 1) * S); // k=1 最近一段（不含今天）
  const s3 = seg(1), s2 = seg(2), s1 = seg(3);
  const depth = (s: VcpBar[]) => { const h = hi(s); return h > 0 ? ((h - lo(s)) / h) * 100 : 0; };
  const d1 = depth(s1), d2 = depth(s2), d3 = depth(s3);
  if (!(d1 >= VCP.minFirst && d1 > d2 && d2 > d3 && d3 <= VCP.maxLast)) return null;

  const v = bars.map((b) => b.v);
  const avg10 = avg(v.slice(T - 10, T)), avg50 = avg(v.slice(T - 50, T));
  if (!(avg50 > 0 && avg10 / avg50 < VCP.dry)) return null;

  // 相對強度：個股 250 日漲幅 ≥ 加權 250 日漲幅（對齊同一天）
  const base = bars[T - 250], ib = idxClose.get(base.date);
  if (ib && idxToday > 0 && (px / base.c - 1) * 100 < (idxToday / ib - 1) * 100) return null;

  const pivot = hi(s3);
  const pivotPrev = hi(bars.slice(T - 1 - S, T - 1)); // 昨天那根看到的樞紐點
  const res = (state: 0 | 1 | 2): VcpResult => ({ state, pivot: r2(pivot), d: [r2(d1), r2(d2), r2(d3)], dry: r2(avg10 / avg50), vr50: r2(v[T] / avg50) });
  const cross = px > pivot && c[T - 1] <= pivotPrev;
  if (cross && v[T] > avg50 * VCP.brk && v[T] >= VCP.minVol) return res(2);
  if (px <= pivot && avg50 >= VCP.minVol) return res(1);
  return null;
}
