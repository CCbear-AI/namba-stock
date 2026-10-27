// M 頭／W 底（雙重頂／雙重底）辨識
// 1) 用 ZigZag 找出轉折高低點（門檻依近期波動自動調整）
// 2) 找最近一組「兩個差不多高的高點（M）／兩個差不多低的低點（W）」，中間那個反向轉折點就是頸線
// 3) 收盤跌破（M）／突破（W）頸線算成立，滿足點＝頸線再走一個「頭到頸線」的距離
// 4) M 和 W 共用同一段轉折（其實是同一波走勢）時兩個都列出，但較舊的標 hidden 不畫，避免兩個形狀疊成一條鋸齒
import type { Bar } from "./types";

export type Pivot = { i: number; price: number; kind: "H" | "L" };
export type DoublePattern = {
  kind: "M" | "W";
  a: Pivot; b: Pivot; mid: Pivot;
  neck: number;
  /** 收盤破頸線那根的位置；還沒破是 -1 */
  broke: number;
  /** 破頸線後最新收盤又回到頸線另一側（假突破／假跌破） */
  back: boolean;
  target: number;
  /** 畫形狀用的五個點（起漲／起跌點 → 頭 → 頸 → 頭 → 破頸或現價），i 為 K 棒位置 */
  shape: { i: number; price: number }[];
  /** 跟另一個型態時間重疊且較舊：只列在說明、不畫在圖上 */
  hidden?: boolean;
};

/** 轉折門檻：近 60 根平均振幅 × 4，限制在 0.5%～25% */
export function swingThreshold(bars: Bar[]) {
  const r = bars.slice(-60).filter((b) => b.close > 0);
  if (!r.length) return 0.1;
  const avg = r.reduce((s, b) => s + (b.high - b.low) / b.close, 0) / r.length;
  return Math.min(0.25, Math.max(0.005, avg * 4));
}

/** ZigZag：價格從上一個極值反向走超過 thr 才確認一個轉折點 */
export function zigzag(bars: Bar[], thr: number): Pivot[] {
  const out: Pivot[] = [];
  if (bars.length < 2) return out;
  let dir = 0; // 1 = 往上找高點，-1 = 往下找低點
  let hi = 0, lo = 0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    if (b.high >= bars[hi].high && dir >= 0) hi = i;
    if (b.low <= bars[lo].low && dir <= 0) lo = i;
    if (dir === 0) {
      if (bars[hi].high < bars[lo].low * (1 + thr)) continue;
      if (hi > lo) { out.push({ i: lo, price: bars[lo].low, kind: "L" }); dir = 1; }
      else { out.push({ i: hi, price: bars[hi].high, kind: "H" }); dir = -1; }
    } else if (dir === 1 && hi !== i && b.low <= bars[hi].high * (1 - thr)) {
      out.push({ i: hi, price: bars[hi].high, kind: "H" }); dir = -1; lo = i;
    } else if (dir === -1 && lo !== i && b.high >= bars[lo].low * (1 + thr)) {
      out.push({ i: lo, price: bars[lo].low, kind: "L" }); dir = 1; hi = i;
    }
  }
  return out;
}

const MIN_GAP = 8; // 兩個頭（底）至少隔 8 根

export function doublePatterns(bars: Bar[], lookback = 250): { pivots: Pivot[]; patterns: DoublePattern[] } {
  const thr = swingThreshold(bars);
  const pivots = zigzag(bars, thr);
  const tol = thr / 2;
  const from = bars.length - lookback;

  const find = (kind: "M" | "W"): DoublePattern | null => {
    const top = kind === "M";
    const peaks = pivots.filter((p) => p.kind === (top ? "H" : "L") && p.i >= from);
    // 從最近的開始找
    for (let y = peaks.length - 1; y > 0; y--) {
      const b = peaks[y];
      for (let x = 0; x < y; x++) {
        const a = peaks[x];
        if (b.i - a.i < MIN_GAP) continue;
        if (Math.abs(a.price - b.price) / Math.max(a.price, b.price) > tol) continue;
        const outer = top ? Math.max(a.price, b.price) : Math.min(a.price, b.price);
        const inner = top ? Math.min(a.price, b.price) : Math.max(a.price, b.price);
        // 兩個頭中間不能有更高的高點（W：更低的低點）
        if (peaks.slice(x + 1, y).some((p) => (top ? p.price >= inner : p.price <= inner))) continue;
        const between = pivots.filter((p) => p.kind !== b.kind && p.i > a.i && p.i < b.i);
        if (!between.length) continue;
        const mid = between.reduce((m, p) => ((top ? p.price < m.price : p.price > m.price) ? p : m));
        // 第二個頭之後收盤又創新高（W：新低）＝型態失效
        let broke = -1, failed = false;
        for (let i = b.i + 1; i < bars.length; i++) {
          const c = bars[i].close;
          if (top ? c > outer * (1 + tol) : c < outer * (1 - tol)) { failed = true; break; }
          if (broke < 0 && (top ? c < mid.price : c > mid.price)) broke = i;
        }
        if (failed) continue;
        const h = Math.abs(outer - mid.price);
        const lastClose = bars[bars.length - 1].close;
        const back = broke >= 0 && (top ? lastClose > mid.price : lastClose < mid.price);
        // 形狀起點：第一個頭前面的反向轉折點；太遠就截在「頭到頸」同樣的距離
        const pre = pivots.filter((p) => p.kind === mid.kind && p.i < a.i).pop();
        const span = Math.max(1, mid.i - a.i);
        const start = !pre ? null : a.i - pre.i <= span ? { i: pre.i, price: pre.price }
          : { i: a.i - span, price: a.price + (pre.price - a.price) * (span / (a.i - pre.i)) };
        // 形狀終點：破頸那根（畫在頸線上）；還沒破就到下一個轉折點或最新一根收盤
        const next = pivots.find((p) => p.kind === mid.kind && p.i > b.i);
        const end = broke >= 0 ? { i: broke, price: mid.price } : next ? { i: next.i, price: next.price } : { i: bars.length - 1, price: lastClose };
        const shape = [...(start ? [start] : []), a, mid, b, ...(end.i > b.i ? [end] : [])].map(({ i, price }) => ({ i, price }));
        return { kind, a, b, mid, neck: mid.price, broke, back, target: top ? mid.price - h : mid.price + h, shape };
      }
    }
    return null;
  };

  const patterns = [find("M"), find("W")].filter((p): p is DoublePattern => !!p);
  if (patterns.length === 2) {
    const [m, w] = patterns;
    if (m.a.i <= w.b.i && w.a.i <= m.b.i) (m.b.i >= w.b.i ? w : m).hidden = true;
  }
  return { pivots, patterns };
}
