// 技術指標（87 個）。全部回傳跟 bars 對齊的陣列，算不出來的位置是 null
import type { Bar } from "./types";

export type V = (number | null)[];
/** 主圖上的方框／線段（i2 = null 代表延伸到最右邊） */
export type Shape =
  | { k: "box"; i1: number; i2: number | null; top: number; bot: number; color: string; alpha?: number; text?: string }
  | { k: "seg"; i1: number; p1: number; i2: number | null; p2: number; color: string; dash?: boolean; width?: number; text?: string; textAt?: "mid" | "end"; below?: boolean; small?: boolean };
/** 買賣訊號記號（畫在主圖 K 棒上下） */
export type Mark = { i: number; buy: boolean; text: string };
export type Line = {
  name: string; data: V; color: string; type?: "line" | "hist" | "dots" | "area" | "marks" | "shapes"; dash?: boolean;
  colors?: (string | null)[]; // 每一點自己的顏色（柱、點、線都可用）
  marks?: Mark[]; // type = "marks" 時用
  shapes?: Shape[]; // type = "shapes" 時用
  hide?: boolean; // 不顯示在說明列
  noScale?: boolean; // 不參與價格軸縮放（離股價很遠的線不要把 K 線壓扁）
};
export type Ind = {
  id: string; name: string; abbr: string; cat: Cat; overlay: boolean; params: number[]; labels?: string[]; desc: string;
  calc: (b: Bar[], p: number[]) => Line[];
  levels?: number[]; // 副圖參考線（例如 RSI 30/70）
};
export type Cat = "熱門腳本" | "均線" | "通道與帶狀" | "趨勢" | "動能與震盪" | "趨勢強度" | "量能" | "波動" | "基本";
export const CATS: Cat[] = ["基本", "熱門腳本", "均線", "通道與帶狀", "趨勢", "動能與震盪", "趨勢強度", "量能", "波動"];

const C = ["#e0b341", "#5aa9ff", "#b48cff", "#4fd1c5", "#f2994a", "#f06292", "#9ccc65"];
const UPC = "#f0505a", DNC = "#22b573";
// 通道／帶狀的上下軌、中線：一律灰色虛線，疊在 K 線和均線上才不會太花
const BAND = "#8b919a";
const band = (name: string, data: V) => L(name, data, BAND, "line", true);

// ---------- 基本運算 ----------
const close = (b: Bar[]) => b.map((x) => x.close);
const hl2 = (b: Bar[]) => b.map((x) => (x.high + x.low) / 2);
const hlc3 = (b: Bar[]) => b.map((x) => (x.high + x.low + x.close) / 3);
const nz = (v: number | null | undefined, d = 0) => (v == null || Number.isNaN(v) ? d : v);

export function sma(a: V, n: number): V {
  const out: V = new Array(a.length).fill(null);
  let s = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v == null) { s = 0; k = 0; continue; }
    s += v; k++;
    if (k > n) { s -= a[i - n]!; k = n; }
    if (k === n) out[i] = s / n;
  }
  return out;
}
export function ema(a: V, n: number): V {
  const out: V = new Array(a.length).fill(null);
  const k = 2 / (n + 1);
  let prev: number | null = null, cnt = 0, s = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v == null) continue;
    if (prev == null) { s += v; cnt++; if (cnt === n) { prev = s / n; out[i] = prev; } continue; }
    prev = v * k + prev * (1 - k); out[i] = prev;
  }
  return out;
}
/** Wilder 平滑（RMA／SMMA） */
export function rma(a: V, n: number): V {
  const out: V = new Array(a.length).fill(null);
  let prev: number | null = null, cnt = 0, s = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v == null) continue;
    if (prev == null) { s += v; cnt++; if (cnt === n) { prev = s / n; out[i] = prev; } continue; }
    prev = (prev * (n - 1) + v) / n; out[i] = prev;
  }
  return out;
}
export function wma(a: V, n: number): V {
  const out: V = new Array(a.length).fill(null);
  const den = (n * (n + 1)) / 2;
  for (let i = n - 1; i < a.length; i++) {
    let s = 0, ok = true;
    for (let j = 0; j < n; j++) { const v = a[i - j]; if (v == null) { ok = false; break; } s += v * (n - j); }
    if (ok) out[i] = s / den;
  }
  return out;
}
function stdev(a: V, n: number): V {
  const m = sma(a, n);
  return a.map((_, i) => {
    if (m[i] == null) return null;
    let s = 0;
    for (let j = 0; j < n; j++) s += (a[i - j]! - m[i]!) ** 2;
    return Math.sqrt(s / n);
  });
}
function highest(a: V, n: number): V { return a.map((_, i) => (i < n - 1 ? null : Math.max(...(a.slice(i - n + 1, i + 1) as number[])))); }
function lowest(a: V, n: number): V { return a.map((_, i) => (i < n - 1 ? null : Math.min(...(a.slice(i - n + 1, i + 1) as number[])))); }
function tr(b: Bar[]): V { return b.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close)))); }
const atrV = (b: Bar[], n: number) => rma(tr(b), n);
const op = (a: V, b: V, f: (x: number, y: number) => number): V => a.map((x, i) => (x == null || b[i] == null ? null : f(x, b[i]!)));
const map = (a: V, f: (x: number, i: number) => number | null): V => a.map((x, i) => (x == null ? null : f(x, i)));
const shift = (a: V, k: number): V => a.map((_, i) => (i - k >= 0 && i - k < a.length ? a[i - k] : null));
const change = (a: V, k = 1): V => a.map((x, i) => (i < k || x == null || a[i - k] == null ? null : x - a[i - k]!));
const sum = (a: V, n: number): V => map(sma(a, n), (x) => x * n);
/** 柱狀：正值變大亮紅、變小淡紅；負值變小亮綠、變大淡綠 */
const dimHist = (v: V) => v.map((x, i) => (x == null ? null : x >= 0 ? (x > nz(v[i - 1], x) ? UPC : UPC + "66") : x < nz(v[i - 1], x) ? DNC : DNC + "66"));
const L = (name: string, data: V, color = C[0], type: Line["type"] = "line", dash = false): Line => ({ name, data, color, type, dash });

// ---------- 指標 ----------
export const INDICATORS: Ind[] = [
  // 基本
  { id: "ma", name: "移動平均線", abbr: "MA", cat: "基本", overlay: true, params: [5, 20, 60], desc: "收盤價的簡單平均", calc: (b, p) => p.map((n, i) => L(`MA${n}`, sma(close(b), n), C[i])) },
  { id: "vol", name: "成交量", abbr: "VOL", cat: "基本", overlay: false, params: [5, 20], desc: "每根的成交量與均量", calc: (b, p) => [
    { name: "量", data: b.map((x) => x.volume), color: "", type: "hist" }, ...p.map((n, i) => L(`MA${n}`, sma(b.map((x) => x.volume), n), C[i])),
  ] },

  // 均線
  { id: "ema", name: "指數移動平均線", abbr: "EMA", cat: "均線", overlay: true, params: [12, 26], desc: "越近的收盤價權重越高", calc: (b, p) => p.map((n, i) => L(`EMA${n}`, ema(close(b), n), C[i + 3])) },
  { id: "wma", name: "加權移動平均線", abbr: "WMA", cat: "均線", overlay: true, params: [9], desc: "權重由近到遠線性遞減", calc: (b, [n]) => [L(`WMA${n}`, wma(close(b), n), C[3])] },
  { id: "vwma", name: "成交量加權移動平均線", abbr: "VWMA", cat: "均線", overlay: true, params: [20], desc: "量大的那幾根權重高", calc: (b, [n]) => [L(`VWMA${n}`, op(sum(b.map((x) => x.close * x.volume), n), sum(b.map((x) => x.volume), n), (x, y) => (y ? x / y : NaN)), C[4])] },
  { id: "hma", name: "Hull 移動平均線", abbr: "HMA", cat: "均線", overlay: true, params: [9], desc: "反應快、延遲小的均線", calc: (b, [n]) => {
    const raw = op(map(wma(close(b), Math.round(n / 2)), (x) => 2 * x), wma(close(b), n), (x, y) => x - y);
    return [L(`HMA${n}`, wma(raw, Math.round(Math.sqrt(n))), C[5])];
  } },
  { id: "dema", name: "雙重指數移動平均線", abbr: "DEMA", cat: "均線", overlay: true, params: [9], desc: "2×EMA − EMA 的 EMA", calc: (b, [n]) => { const e = ema(close(b), n); return [L(`DEMA${n}`, op(e, ema(e, n), (x, y) => 2 * x - y), C[3])]; } },
  { id: "tema", name: "三重指數移動平均線", abbr: "TEMA", cat: "均線", overlay: true, params: [9], desc: "三層 EMA 消去延遲", calc: (b, [n]) => { const e1 = ema(close(b), n), e2 = ema(e1, n), e3 = ema(e2, n); return [L(`TEMA${n}`, e1.map((x, i) => (x == null || e2[i] == null || e3[i] == null ? null : 3 * x - 3 * e2[i]! + e3[i]!)), C[4])]; } },
  { id: "smma", name: "平滑移動平均線", abbr: "SMMA", cat: "均線", overlay: true, params: [7], desc: "Wilder 平滑（RMA）", calc: (b, [n]) => [L(`SMMA${n}`, rma(close(b), n), C[6])] },
  { id: "lsma", name: "最小平方移動平均線", abbr: "LSMA", cat: "均線", overlay: true, params: [25], desc: "線性回歸線的端點連成的曲線", calc: (b, [n]) => [L(`LSMA${n}`, linreg(close(b), n), C[5])] },
  { id: "alma", name: "Arnaud Legoux 移動平均線", abbr: "ALMA", cat: "均線", overlay: true, params: [9, 0.85, 6], desc: "高斯權重的均線", calc: (b, [n, off, sig]) => {
    const m = off * (n - 1), s = n / sig, w = Array.from({ length: n }, (_, i) => Math.exp(-((i - m) ** 2) / (2 * s * s))), ws = w.reduce((x, y) => x + y, 0);
    const c = close(b);
    return [L(`ALMA${n}`, c.map((_, i) => (i < n - 1 ? null : w.reduce((acc, wi, j) => acc + wi * c[i - n + 1 + j], 0) / ws)), C[3])];
  } },
  { id: "md", name: "McGinley 動態線", abbr: "MD", cat: "均線", overlay: true, params: [14], desc: "跟著行情快慢自動調速的均線", calc: (b, [n]) => {
    const out: V = []; let md: number | null = null;
    b.forEach((x, i) => { if (i < n - 1) { out.push(null); return; } if (md == null) md = b.slice(i - n + 1, i + 1).reduce((s, y) => s + y.close, 0) / n; else md = md + (x.close - md) / (n * Math.pow(x.close / md, 4)); out.push(md); });
    return [L(`MD${n}`, out, C[6])];
  } },

  // 通道與帶狀
  { id: "boll", name: "布林通道", abbr: "BOLL", cat: "通道與帶狀", overlay: true, params: [20, 2], desc: "均線 ± 幾倍標準差", calc: (b, [n, k]) => {
    const m = sma(close(b), n), sd = stdev(close(b), n);
    return [band("上軌", op(m, sd, (x, y) => x + k * y)), band("中軌", m), band("下軌", op(m, sd, (x, y) => x - k * y))];
  } },
  { id: "kc", name: "Keltner 通道", abbr: "KC", cat: "通道與帶狀", overlay: true, params: [20, 2, 10], desc: "EMA ± 幾倍 ATR", calc: (b, [n, k, an]) => {
    const m = ema(close(b), n), a = atrV(b, an);
    return [band("上軌", op(m, a, (x, y) => x + k * y)), band("中線", m), band("下軌", op(m, a, (x, y) => x - k * y))];
  } },
  { id: "dc", name: "唐奇安通道", abbr: "DC", cat: "通道與帶狀", overlay: true, params: [20], desc: "N 根的最高價與最低價", calc: (b, [n]) => {
    const h = highest(b.map((x) => x.high), n), l = lowest(b.map((x) => x.low), n);
    return [band("上軌", h), band("中線", op(h, l, (x, y) => (x + y) / 2)), band("下軌", l)];
  } },
  { id: "env", name: "包絡線", abbr: "ENV", cat: "通道與帶狀", overlay: true, params: [20, 10], desc: "均線上下各幾 %", calc: (b, [n, k]) => {
    const m = sma(close(b), n);
    return [band("上軌", map(m, (x) => x * (1 + k / 100))), band("中線", m), band("下軌", map(m, (x) => x * (1 - k / 100)))];
  } },
  { id: "ichimoku", name: "一目均衡表", abbr: "Ichimoku", cat: "通道與帶狀", overlay: true, params: [9, 26, 52, 26], desc: "轉換線、基準線、雲帶與遲行線", calc: (b, [a, k, s, d]) => {
    const mid = (n: number) => op(highest(b.map((x) => x.high), n), lowest(b.map((x) => x.low), n), (x, y) => (x + y) / 2);
    const conv = mid(a), base = mid(k), spanA = shift(op(conv, base, (x, y) => (x + y) / 2), d), spanB = shift(mid(s), d);
    return [L("轉換線", conv, "#5aa9ff"), L("基準線", base, "#f06292"), L("先行A", spanA, "#22b573", "line", true), L("先行B", spanB, "#f0505a", "line", true), L("遲行線", shift(close(b), -d), "#9ccc65")];
  } },

  // 趨勢
  { id: "sar", name: "拋物線指標", abbr: "SAR", cat: "趨勢", overlay: true, params: [0.02, 0.02, 0.2], desc: "點在 K 棒下方偏多、上方偏空", calc: (b, [start, inc, max]) => [L("SAR", psar(b, start, inc, max), "#e0b341", "dots")] },
  { id: "supertrend", name: "超級趨勢", abbr: "SuperTrend", cat: "趨勢", overlay: true, params: [10, 3], desc: "多頭在下方（紅）、空頭在上方", calc: (b, [n, k]) => {
    const { up, dn } = supertrend(b, n, k);
    return [L("多頭", up, UPC), L("空頭", dn, DNC)];
  } },
  { id: "alligator", name: "鱷魚線", abbr: "Alligator", cat: "趨勢", overlay: true, params: [13, 8, 5, 8, 5, 3], desc: "三條往右平移的平滑均線", calc: (b, [j, t, l, js, ts, ls]) => {
    const m = hl2(b);
    return [L("顎", shift(rma(m, j), js), "#5aa9ff"), L("齒", shift(rma(m, t), ts), "#f0505a"), L("唇", shift(rma(m, l), ls), "#22b573")];
  } },
  { id: "vwap", name: "成交量加權均價", abbr: "VWAP", cat: "趨勢", overlay: true, params: [], desc: "每天從開盤累計的量價均價（分 K 用；日 K 以上為整段累計）", calc: (b) => {
    let pv = 0, v = 0, day = -1;
    const intra = isIntraday(b);
    return [L("VWAP", b.map((x) => {
      const d = Math.floor((x.time + 8 * 3600) / 86400);
      if (intra && d !== day) { pv = 0; v = 0; day = d; } // 分 K：每天開盤重算
      pv += ((x.high + x.low + x.close) / 3) * x.volume; v += x.volume;
      return v ? pv / v : null;
    }), "#4fd1c5")];
  } },
  { id: "ce", name: "吊燈停損", abbr: "CE", cat: "趨勢", overlay: true, params: [22, 3], desc: "最高價往下幾倍 ATR 的移動停損", calc: (b, [n, k]) => {
    const a = atrV(b, n);
    return [L("多方停損", op(highest(b.map((x) => x.high), n), a, (x, y) => x - k * y), UPC, "line", true), L("空方停損", op(lowest(b.map((x) => x.low), n), a, (x, y) => x + k * y), DNC, "line", true)];
  } },
  { id: "cks", name: "Chande Kroll 停損", abbr: "CKS", cat: "趨勢", overlay: true, params: [10, 1, 9], desc: "用 ATR 算的多空停損線", calc: (b, [p, x, q]) => {
    const a = atrV(b, p);
    const fh = op(highest(b.map((y) => y.high), p), a, (h, t) => h - x * t), fl = op(lowest(b.map((y) => y.low), p), a, (l, t) => l + x * t);
    return [L("空方停損", highest(fh, q), DNC, "line", true), L("多方停損", lowest(fl, q), UPC, "line", true)];
  } },

  // 動能與震盪
  { id: "macd", name: "指數平滑異同移動平均", abbr: "MACD", cat: "動能與震盪", overlay: false, params: [12, 26, 9], desc: "快慢 EMA 的差與訊號線", calc: (b, [f, s, g]) => {
    const dif = op(ema(close(b), f), ema(close(b), s), (x, y) => x - y), dea = ema(dif, g);
    return [{ name: "柱", data: op(dif, dea, (x, y) => (x - y) * 2), color: "", type: "hist" }, L("DIF", dif, "#e0b341"), L("DEA", dea, "#5aa9ff")];
  } },
  { id: "rsi", name: "相對強弱指標", abbr: "RSI", cat: "動能與震盪", overlay: false, params: [6, 12], desc: "漲勢占總波動的比例，70 以上偏熱、30 以下偏冷", levels: [30, 70], calc: (b, p) => p.map((n, i) => L(`RSI${n}`, rsi(close(b), n), C[i])) },
  { id: "kd", name: "隨機指標", abbr: "KD", cat: "動能與震盪", overlay: false, params: [9, 3, 3], desc: "台灣常用的 KD（RSV 平滑）", levels: [20, 80], calc: (b, [n, k, d]) => {
    const h = highest(b.map((x) => x.high), n), l = lowest(b.map((x) => x.low), n);
    const K: V = [], D: V = []; let pk = 50, pd = 50;
    b.forEach((x, i) => {
      if (h[i] == null) { K.push(null); D.push(null); return; }
      const rsv = h[i] === l[i] ? 50 : ((x.close - l[i]!) / (h[i]! - l[i]!)) * 100;
      pk = (pk * (k - 1) + rsv) / k; pd = (pd * (d - 1) + pk) / d; K.push(pk); D.push(pd);
    });
    return [L("K", K, "#e0b341"), L("D", D, "#5aa9ff")];
  } },
  { id: "stoch", name: "隨機指標（歐美算法）", abbr: "Stoch", cat: "動能與震盪", overlay: false, params: [14, 1, 3], desc: "%K 與 %D", levels: [20, 80], calc: (b, [n, s, d]) => {
    const h = highest(b.map((x) => x.high), n), l = lowest(b.map((x) => x.low), n);
    const k = sma(b.map((x, i) => (h[i] == null ? null : h[i] === l[i] ? 50 : ((x.close - l[i]!) / (h[i]! - l[i]!)) * 100)), s);
    return [L("%K", k, "#e0b341"), L("%D", sma(k, d), "#5aa9ff")];
  } },
  { id: "stochrsi", name: "隨機相對強弱指標", abbr: "Stoch RSI", cat: "動能與震盪", overlay: false, params: [3, 3, 14, 14], desc: "對 RSI 再做一次隨機指標", levels: [20, 80], calc: (b, [ks, ds, rn, sn]) => {
    const r = rsi(close(b), rn), h = highest(r, sn), l = lowest(r, sn);
    const k = sma(r.map((x, i) => (x == null || h[i] == null ? null : h[i] === l[i] ? 50 : ((x - l[i]!) / (h[i]! - l[i]!)) * 100)), ks);
    return [L("K", k, "#e0b341"), L("D", sma(k, ds), "#5aa9ff")];
  } },
  { id: "cci", name: "順勢指標", abbr: "CCI", cat: "動能與震盪", overlay: false, params: [20], desc: "價格偏離平均的程度", levels: [-100, 100], calc: (b, [n]) => {
    const tp = hlc3(b), m = sma(tp, n);
    return [L("CCI", tp.map((x, i) => { if (m[i] == null) return null; let md = 0; for (let j = 0; j < n; j++) md += Math.abs(tp[i - j]! - m[i]!); md /= n; return md ? (x! - m[i]!) / (0.015 * md) : 0; }), "#e0b341")];
  } },
  { id: "wr", name: "威廉指標", abbr: "W%R", cat: "動能與震盪", overlay: false, params: [14], desc: "收盤在 N 根區間的位置（0～−100）", levels: [-80, -20], calc: (b, [n]) => {
    const h = highest(b.map((x) => x.high), n), l = lowest(b.map((x) => x.low), n);
    return [L("%R", b.map((x, i) => (h[i] == null ? null : h[i] === l[i] ? -50 : ((h[i]! - x.close) / (h[i]! - l[i]!)) * -100)), "#e0b341")];
  } },
  { id: "roc", name: "變動率指標", abbr: "ROC", cat: "動能與震盪", overlay: false, params: [9], desc: "跟 N 根前比漲跌幾 %", levels: [0], calc: (b, [n]) => [L("ROC", close(b).map((x, i) => (i < n ? null : ((x - b[i - n].close) / b[i - n].close) * 100)), "#e0b341")] },
  { id: "mom", name: "動量指標", abbr: "MOM", cat: "動能與震盪", overlay: false, params: [10], desc: "跟 N 根前的價差", levels: [0], calc: (b, [n]) => [L("MOM", change(close(b), n), "#e0b341")] },
  { id: "trix", name: "三重指數平滑", abbr: "TRIX", cat: "動能與震盪", overlay: false, params: [18], desc: "三層 EMA 的變化率", levels: [0], calc: (b, [n]) => {
    const e = ema(ema(ema(close(b), n), n), n);
    return [L("TRIX", e.map((x, i) => (x == null || i === 0 || e[i - 1] == null ? null : ((x - e[i - 1]!) / e[i - 1]!) * 10000)), "#e0b341")];
  } },
  { id: "ao", name: "動量震盪指標", abbr: "AO", cat: "動能與震盪", overlay: false, params: [], desc: "中價 5 與 34 均線差", levels: [0], calc: (b) => [{ name: "AO", data: op(sma(hl2(b), 5), sma(hl2(b), 34), (x, y) => x - y), color: "", type: "hist" }] },
  { id: "bias", name: "乖離率", abbr: "BIAS", cat: "動能與震盪", overlay: false, params: [6, 12, 24], desc: "收盤偏離均線幾 %", levels: [0], calc: (b, p) => p.map((n, i) => L(`BIAS${n}`, op(close(b), sma(close(b), n), (x, y) => ((x - y) / y) * 100), C[i])) },
  { id: "uo", name: "終極震盪指標", abbr: "UO", cat: "動能與震盪", overlay: false, params: [7, 14, 28], desc: "三個週期的買壓加權", levels: [30, 70], calc: (b, [a, m, l]) => {
    const bp = b.map((x, i) => x.close - Math.min(x.low, i ? b[i - 1].close : x.low)), t = tr(b);
    const avg = (n: number) => op(sum(bp, n), sum(t, n), (x, y) => (y ? x / y : 0));
    const A = avg(a), M = avg(m), Lg = avg(l);
    return [L("UO", A.map((x, i) => (x == null || M[i] == null || Lg[i] == null ? null : (100 * (4 * x + 2 * M[i]! + Lg[i]!)) / 7)), "#e0b341")];
  } },
  { id: "tsi", name: "真實強弱指標", abbr: "TSI", cat: "動能與震盪", overlay: false, params: [25, 13, 13], desc: "雙重平滑的動量", levels: [0], calc: (b, [l, s, g]) => {
    const pc = change(close(b)), ds = ema(ema(pc, l), s), da = ema(ema(map(pc, Math.abs), l), s);
    const t = op(ds, da, (x, y) => (y ? (100 * x) / y : 0));
    return [L("TSI", t, "#e0b341"), L("訊號", ema(t, g), "#5aa9ff")];
  } },
  { id: "cmo", name: "錢德動量擺動", abbr: "CMO", cat: "動能與震盪", overlay: false, params: [9], desc: "（漲−跌）÷（漲+跌）", levels: [-50, 50], calc: (b, [n]) => {
    const pc = change(close(b)), up = sum(map(pc, (x) => Math.max(x, 0)), n), dn = sum(map(pc, (x) => Math.max(-x, 0)), n);
    return [L("CMO", op(up, dn, (x, y) => (x + y ? ((x - y) / (x + y)) * 100 : 0)), "#e0b341")];
  } },
  { id: "dpo", name: "去趨勢價格擺動", abbr: "DPO", cat: "動能與震盪", overlay: false, params: [21], desc: "扣掉趨勢後的週期", levels: [0], calc: (b, [n]) => { const m = sma(close(b), n), k = Math.floor(n / 2) + 1; return [L("DPO", close(b).map((x, i) => (i < k || m[i - k] == null ? null : x - m[i - k]!)), "#e0b341")]; } },
  { id: "coppock", name: "Coppock 曲線", abbr: "Coppock", cat: "動能與震盪", overlay: false, params: [10, 14, 11], desc: "長週期 ROC 的加權均線", levels: [0], calc: (b, [w, l, s]) => {
    const roc = (n: number) => close(b).map((x, i) => (i < n ? null : ((x - b[i - n].close) / b[i - n].close) * 100));
    return [L("Coppock", wma(op(roc(l), roc(s), (x, y) => x + y), w), "#e0b341")];
  } },
  { id: "kst", name: "確然指標", abbr: "KST", cat: "動能與震盪", overlay: false, params: [10, 15, 20, 30, 10, 10, 10, 15, 9], desc: "四個 ROC 的加權和", levels: [0], calc: (b, [r1, r2, r3, r4, s1, s2, s3, s4, sg]) => {
    const roc = (n: number) => close(b).map((x, i) => (i < n ? null : ((x - b[i - n].close) / b[i - n].close) * 100));
    const parts = [[r1, s1], [r2, s2], [r3, s3], [r4, s4]].map(([r, s], i) => map(sma(roc(r), s), (x) => x * (i + 1)));
    const k = parts[0].map((_, i) => (parts.some((p) => p[i] == null) ? null : parts.reduce((a, p) => a + p[i]!, 0)));
    return [L("KST", k, "#e0b341"), L("訊號", sma(k, sg), "#5aa9ff")];
  } },
  { id: "fisher", name: "Fisher 轉換", abbr: "Fisher", cat: "動能與震盪", overlay: false, params: [9], desc: "把價格轉成接近常態分布，轉折較明顯", levels: [0], calc: (b, [n]) => {
    const m = hl2(b), h = highest(m, n), l = lowest(m, n); const f: V = []; let v = 0, fp = 0;
    m.forEach((x, i) => { if (h[i] == null) { f.push(null); return; } v = 0.66 * ((h[i] === l[i] ? 0 : (x! - l[i]!) / (h[i]! - l[i]!)) - 0.5) + 0.67 * v; v = Math.max(-0.999, Math.min(0.999, v)); fp = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * fp; f.push(fp); });
    return [L("Fisher", f, "#e0b341"), L("觸發", shift(f, 1), "#5aa9ff")];
  } },
  { id: "ppo", name: "百分比價格擺動", abbr: "PPO", cat: "動能與震盪", overlay: false, params: [12, 26, 9], desc: "MACD 的百分比版", levels: [0], calc: (b, [f, s, g]) => {
    const p = op(ema(close(b), f), ema(close(b), s), (x, y) => ((x - y) / y) * 100), sig = ema(p, g);
    return [{ name: "柱", data: op(p, sig, (x, y) => x - y), color: "", type: "hist" }, L("PPO", p, "#e0b341"), L("訊號", sig, "#5aa9ff")];
  } },
  { id: "rvgi", name: "相對活力指標", abbr: "RVGI", cat: "動能與震盪", overlay: false, params: [10], desc: "收盤相對開盤的力道", levels: [0], calc: (b, [n]) => {
    const co = b.map((x) => x.close - x.open), hl = b.map((x) => x.high - x.low);
    const sw = (a: V) => a.map((_, i) => (i < 3 ? null : (a[i]! + 2 * a[i - 1]! + 2 * a[i - 2]! + a[i - 3]!) / 6));
    const r = op(sum(sw(co), n), sum(sw(hl), n), (x, y) => (y ? x / y : 0));
    return [L("RVGI", r, "#e0b341"), L("訊號", sw(r), "#5aa9ff")];
  } },
  { id: "bbp", name: "多空力道", abbr: "BBP", cat: "動能與震盪", overlay: false, params: [13], desc: "最高價、最低價各減 EMA 的和", levels: [0], calc: (b, [n]) => { const e = ema(close(b), n); return [{ name: "BBP", data: b.map((x, i) => (e[i] == null ? null : x.high + x.low - 2 * e[i]!)), color: "", type: "hist" }]; } },
  { id: "bop", name: "均勢指標", abbr: "BOP", cat: "動能與震盪", overlay: false, params: [], desc: "（收−開）÷（高−低）", levels: [0], calc: (b) => [{ name: "BOP", data: b.map((x) => (x.high > x.low ? (x.close - x.open) / (x.high - x.low) : 0)), color: "", type: "hist" }] },
  { id: "crsi", name: "康納相對強弱指標", abbr: "CRSI", cat: "動能與震盪", overlay: false, params: [3, 2, 100], desc: "RSI、連漲連跌 RSI 與漲幅百分位的平均", levels: [10, 90], calc: (b, [rn, sn, pn]) => {
    const c = close(b); const st: number[] = []; c.forEach((x, i) => { const p = i ? c[i - 1] : x; const s = i ? st[i - 1] : 0; st.push(x > p ? (s > 0 ? s + 1 : 1) : x < p ? (s < 0 ? s - 1 : -1) : 0); });
    const r1 = rsi(c, rn), r2 = rsi(st, sn), roc1 = change(c);
    const pr = roc1.map((x, i) => { if (x == null || i < pn) return null; let k = 0; for (let j = i - pn; j < i; j++) if (roc1[j] != null && roc1[j]! < x) k++; return (k / pn) * 100; });
    return [L("CRSI", r1.map((x, i) => (x == null || r2[i] == null || pr[i] == null ? null : (x + r2[i]! + pr[i]!) / 3)), "#e0b341")];
  } },
  { id: "smi", name: "SMI 遍歷指標", abbr: "SMI", cat: "動能與震盪", overlay: false, params: [20, 5, 5], desc: "收盤相對區間中點的雙重平滑", levels: [-40, 40], calc: (b, [n, s1, s2]) => {
    const h = highest(b.map((x) => x.high), n), l = lowest(b.map((x) => x.low), n);
    const d = b.map((x, i) => (h[i] == null ? null : x.close - (h[i]! + l[i]!) / 2)), r = op(h, l, (x, y) => x - y);
    const s = op(ema(ema(d, s1), s2), ema(ema(r, s1), s2), (x, y) => (y ? (200 * x) / y : 0));
    return [L("SMI", s, "#e0b341"), L("訊號", ema(s, s2), "#5aa9ff")];
  } },

  // 趨勢強度
  { id: "adx", name: "趨向指標", abbr: "ADX", cat: "趨勢強度", overlay: false, params: [14, 14], desc: "+DI、−DI 與趨勢強度 ADX", levels: [25], calc: (b, [n, s]) => { const { pdi, mdi, adx } = dmi(b, n, s); return [L("+DI", pdi, UPC), L("−DI", mdi, DNC), L("ADX", adx, "#e0b341")]; } },
  { id: "aroon", name: "阿隆指標", abbr: "Aroon", cat: "趨勢強度", overlay: false, params: [14], desc: "多久前出現 N 根最高／最低", levels: [50], calc: (b, [n]) => {
    const up: V = [], dn: V = [];
    b.forEach((_, i) => { if (i < n) { up.push(null); dn.push(null); return; } let hi = i, lo = i; for (let j = i - n; j <= i; j++) { if (b[j].high >= b[hi].high) hi = j; if (b[j].low <= b[lo].low) lo = j; } up.push(((n - (i - hi)) / n) * 100); dn.push(((n - (i - lo)) / n) * 100); });
    return [L("Aroon Up", up, UPC), L("Aroon Down", dn, DNC)];
  } },
  { id: "vi", name: "渦旋指標", abbr: "VI", cat: "趨勢強度", overlay: false, params: [14], desc: "+VI 與 −VI 交叉看趨勢", levels: [1], calc: (b, [n]) => {
    const vp = b.map((x, i) => (i ? Math.abs(x.high - b[i - 1].low) : null)), vm = b.map((x, i) => (i ? Math.abs(x.low - b[i - 1].high) : null)), t = sum(tr(b), n);
    return [L("+VI", op(sum(vp, n), t, (x, y) => x / y), UPC), L("−VI", op(sum(vm, n), t, (x, y) => x / y), DNC)];
  } },
  { id: "chop", name: "波動指數", abbr: "CHOP", cat: "趨勢強度", overlay: false, params: [14], desc: "高＝盤整、低＝趨勢", levels: [38.2, 61.8], calc: (b, [n]) => {
    const t = sum(tr(b), n), h = highest(b.map((x) => x.high), n), l = lowest(b.map((x) => x.low), n);
    return [L("CHOP", t.map((x, i) => (x == null || h[i] == null || h[i] === l[i] ? null : (100 * Math.log10(x / (h[i]! - l[i]!))) / Math.log10(n))), "#e0b341")];
  } },
  { id: "mi", name: "質量指標", abbr: "MI", cat: "趨勢強度", overlay: false, params: [10], desc: "高低區間擴張，常在反轉前升高", levels: [27], calc: (b, [n]) => { const r = b.map((x) => x.high - x.low), e1 = ema(r, 9), e2 = ema(e1, 9); return [L("MI", sum(op(e1, e2, (x, y) => (y ? x / y : 1)), n), "#e0b341")]; } },

  // 量能
  { id: "rvol", name: "相對成交量", abbr: "RVOL", cat: "量能", overlay: false, params: [20, 2], desc: "今天的量是均量的幾倍（≥ 門檻標紅）", levels: [1], calc: (b, [n, k]) => {
    const m = shift(sma(b.map((x) => x.volume), n), 1);
    const r = b.map((x, i) => (m[i] ? x.volume / m[i]! : null));
    return [{ name: "RVOL", data: r, color: "", type: "hist", dash: false }, L(`門檻 ${k}`, b.map(() => k), "#f2994a", "line", true)];
  } },
  { id: "er", name: "推進效率", abbr: "ER", cat: "量能", overlay: false, params: [20, 2, 0.3], desc: "量有沒有換成推進：N 根淨移動 ÷ 總路徑", levels: [0.3], calc: (b, [n]) => {
    const c = close(b);
    return [L("ER", c.map((x, i) => { if (i < n) return null; let path = 0; for (let j = i - n + 1; j <= i; j++) path += Math.abs(c[j] - c[j - 1]); return path ? Math.abs(x - c[i - n]) / path : 0; }), "#e0b341")];
  } },
  { id: "abs", name: "吸收候選", abbr: "ABS", cat: "量能", overlay: true, params: [20, 2, 0.3, 20], desc: "爆量但漲跌不到平常波幅三成的 K 棒（有人在吸收）", calc: (b, [n, k, e]) => {
    const vm = shift(sma(b.map((x) => x.volume), n), 1), rm = shift(sma(b.map((x) => x.high - x.low), n), 1);
    return [L("吸收", b.map((x, i) => (vm[i] && rm[i] && x.volume >= k * vm[i]! && Math.abs(x.close - (i ? b[i - 1].close : x.open)) < e * rm[i]! ? x.high : null)), "#f2994a", "dots")];
  } },
  { id: "poc", name: "成交密集價", abbr: "POC", cat: "量能", overlay: true, params: [100, 24, 70], desc: "最近 N 根成交量最集中的價位與 70% 價值區", calc: (b, [n, bins, va]) => {
    const seg = b.slice(-n); if (seg.length < 5) return [];
    const lo = Math.min(...seg.map((x) => x.low)), hi = Math.max(...seg.map((x) => x.high)), step = (hi - lo) / bins || 1;
    const vol = new Array(bins).fill(0);
    for (const x of seg) { const a = Math.floor((x.low - lo) / step), z = Math.min(bins - 1, Math.floor((x.high - lo) / step)); for (let k = a; k <= z; k++) vol[k] += x.volume / (z - a + 1); }
    const p = vol.indexOf(Math.max(...vol));
    let up = p, dn = p, acc = vol[p]; const tot = vol.reduce((s, v) => s + v, 0);
    while (acc < (tot * va) / 100 && (up < bins - 1 || dn > 0)) { const nu = up < bins - 1 ? vol[up + 1] : -1, nd = dn > 0 ? vol[dn - 1] : -1; if (nu >= nd) { up++; acc += nu; } else { dn--; acc += nd; } }
    const at = (v: number) => b.map((_, i) => (i >= b.length - n ? v : null));
    return [L("POC", at(lo + (p + 0.5) * step), "#f2994a"), L("價值區上緣", at(lo + (up + 1) * step), "#9aa0a8", "line", true), L("價值區下緣", at(lo + dn * step), "#9aa0a8", "line", true)];
  } },
  { id: "obv", name: "能量潮", abbr: "OBV", cat: "量能", overlay: false, params: [], desc: "漲加量、跌減量的累計", calc: (b) => { let s = 0; return [L("OBV", b.map((x, i) => (s += i === 0 ? 0 : x.close > b[i - 1].close ? x.volume : x.close < b[i - 1].close ? -x.volume : 0)), "#e0b341")]; } },
  { id: "mfi", name: "資金流量指標", abbr: "MFI", cat: "量能", overlay: false, params: [14], desc: "含量的 RSI", levels: [20, 80], calc: (b, [n]) => {
    const tp = hlc3(b), mf = tp.map((x, i) => x! * b[i].volume);
    const pos = mf.map((x, i) => (i && tp[i]! > tp[i - 1]! ? x : 0)), neg = mf.map((x, i) => (i && tp[i]! < tp[i - 1]! ? x : 0));
    return [L("MFI", op(sum(pos, n), sum(neg, n), (p, q) => (q ? 100 - 100 / (1 + p / q) : 100)), "#e0b341")];
  } },
  { id: "cmf", name: "蔡金資金流量", abbr: "CMF", cat: "量能", overlay: false, params: [20], desc: "收在區間上緣且有量＝資金流入", levels: [0], calc: (b, [n]) => [L("CMF", op(sum(mfv(b), n), sum(b.map((x) => x.volume), n), (x, y) => (y ? x / y : 0)), "#e0b341")] },
  { id: "ad", name: "累積派發線", abbr: "A/D", cat: "量能", overlay: false, params: [], desc: "資金流量的累計", calc: (b) => { let s = 0; return [L("A/D", mfv(b).map((x) => (s += x!)), "#e0b341")]; } },
  { id: "cho", name: "蔡金擺動指標", abbr: "CHO", cat: "量能", overlay: false, params: [3, 10], desc: "A/D 的快慢 EMA 差", levels: [0], calc: (b, [f, s]) => { let acc = 0; const ad = mfv(b).map((x) => (acc += x!)); return [L("CHO", op(ema(ad, f), ema(ad, s), (x, y) => x - y), "#e0b341")]; } },
  { id: "efi", name: "Elder 強力指標", abbr: "EFI", cat: "量能", overlay: false, params: [13], desc: "價格變動 × 量", levels: [0], calc: (b, [n]) => [L("EFI", ema(b.map((x, i) => (i ? (x.close - b[i - 1].close) * x.volume : null)), n), "#e0b341")] },
  { id: "eom", name: "簡易波動指標", abbr: "EOM", cat: "量能", overlay: false, params: [14, 10000], desc: "價格移動需要多少量", levels: [0], calc: (b, [n, d]) => [L("EOM", sma(b.map((x, i) => (i && x.volume && x.high > x.low ? (((x.high + x.low) / 2 - (b[i - 1].high + b[i - 1].low) / 2) * d * (x.high - x.low)) / x.volume : null)), n), "#e0b341")] },
  { id: "pvt", name: "價量趨勢", abbr: "PVT", cat: "量能", overlay: false, params: [], desc: "漲跌幅 × 量的累計", calc: (b) => { let s = 0; return [L("PVT", b.map((x, i) => (s += i ? ((x.close - b[i - 1].close) / b[i - 1].close) * x.volume : 0)), "#e0b341")]; } },
  { id: "vo", name: "成交量擺動", abbr: "VO", cat: "量能", overlay: false, params: [5, 10], desc: "快慢均量差幾 %", levels: [0], calc: (b, [f, s]) => { const v = b.map((x) => x.volume); return [L("VO", op(ema(v, f), ema(v, s), (x, y) => (y ? ((x - y) / y) * 100 : 0)), "#e0b341")]; } },
  { id: "nv", name: "淨成交量", abbr: "NV", cat: "量能", overlay: false, params: [], desc: "收漲算買量、收跌算賣量", levels: [0], calc: (b) => [{ name: "NV", data: b.map((x, i) => (i === 0 ? 0 : x.close > b[i - 1].close ? x.volume : x.close < b[i - 1].close ? -x.volume : 0)), color: "", type: "hist" }] },
  { id: "kvo", name: "Klinger 擺動", abbr: "KVO", cat: "量能", overlay: false, params: [34, 55, 13], desc: "長短期量能力道差", levels: [0], calc: (b, [f, s, g]) => {
    const tp = hlc3(b); const vf = b.map((x, i) => (i ? (tp[i]! > tp[i - 1]! ? 1 : -1) * x.volume : 0));
    const k = op(ema(vf, f), ema(vf, s), (x, y) => x - y);
    return [L("KVO", k, "#e0b341"), L("訊號", ema(k, g), "#5aa9ff")];
  } },

  // 波動
  { id: "atr", name: "真實波幅均值", abbr: "ATR", cat: "波動", overlay: false, params: [14], desc: "平均每根的波動（元）", calc: (b, [n]) => [L("ATR", atrV(b, n), "#e0b341")] },
  { id: "natr", name: "標準化真實波幅", abbr: "NATR", cat: "波動", overlay: false, params: [14], desc: "ATR ÷ 收盤（%）", calc: (b, [n]) => [L("NATR", op(atrV(b, n), close(b), (x, y) => (x / y) * 100), "#e0b341")] },
  { id: "std", name: "標準差", abbr: "STD", cat: "波動", overlay: false, params: [20], desc: "收盤價的標準差", calc: (b, [n]) => [L("STD", stdev(close(b), n), "#e0b341")] },
  { id: "hv", name: "歷史波動率", abbr: "HV", cat: "波動", overlay: false, params: [20, 252], desc: "年化的報酬率標準差（%）", calc: (b, [n, y]) => { const r = close(b).map((x, i) => (i ? Math.log(x / b[i - 1].close) : null)); return [L("HV", map(stdev(r, n), (x) => x * Math.sqrt(y) * 100), "#e0b341")]; } },
  { id: "bbw", name: "布林帶寬", abbr: "BBW", cat: "波動", overlay: false, params: [20, 2], desc: "布林上下軌距離 ÷ 中軌（%），越小越壓縮", calc: (b, [n, k]) => [L("BBW", op(stdev(close(b), n), sma(close(b), n), (s, m) => ((2 * k * s) / m) * 100), "#e0b341")] },
  { id: "cv", name: "蔡金波動", abbr: "CV", cat: "波動", overlay: false, params: [10, 10], desc: "高低差 EMA 的變化率", levels: [0], calc: (b, [n, k]) => { const e = ema(b.map((x) => x.high - x.low), n); return [L("CV", e.map((x, i) => (x == null || i < k || e[i - k] == null ? null : ((x - e[i - k]!) / e[i - k]!) * 100)), "#e0b341")]; } },
  // 熱門腳本：TradingView 上常用的社群指標，照公開的概念自己重寫（不是原作者程式碼，訊號可能略有差異）
  { id: "sqz", name: "擠壓動能", abbr: "SQZMOM", cat: "熱門腳本", overlay: false, params: [20, 2, 20, 1.5], labels: ["布林週期", "布林倍數", "Keltner 週期", "Keltner 倍數"],
    desc: "布林縮進 Keltner 通道＝擠壓中（橘點），放開（灰點）後看動能柱往哪邊（LazyBear 概念）", levels: [0], calc: (b, [bn, bk, kn, kk]) => {
    const c = close(b), bm = sma(c, bn), bs = stdev(c, bn), km = sma(c, kn), kr = sma(tr(b), kn);
    const hh = highest(b.map((x) => x.high), kn), ll = lowest(b.map((x) => x.low), kn);
    const val = linreg(c.map((x, i) => (hh[i] == null || km[i] == null ? null : x - ((hh[i]! + ll[i]!) / 2 + km[i]!) / 2)), kn);
    const state = b.map((_, i) => {
      if (bm[i] == null || km[i] == null) return null;
      const ub = bm[i]! + bk * bs[i]!, lb = bm[i]! - bk * bs[i]!, uk = km[i]! + kk * kr[i]!, lk = km[i]! - kk * kr[i]!;
      return lb > lk && ub < uk ? "#f2994a" : lb < lk && ub > uk ? "#646a73" : "#5aa9ff";
    });
    return [
      { name: "動能", data: val, color: "", type: "hist", colors: dimHist(val) },
      { name: "擠壓", data: state.map((x) => (x ? 0 : null)), color: "#f2994a", type: "dots", colors: state, hide: true },
    ];
  } },
  { id: "wt", name: "波浪趨勢震盪", abbr: "WaveTrend", cat: "熱門腳本", overlay: false, params: [10, 21], labels: ["通道週期", "平均週期"],
    desc: "WT1 與 WT2 交叉（紅點金叉、綠點死叉），在 −60 以下金叉、60 以上死叉較有參考價值（LazyBear 概念）", levels: [-60, 60], calc: (b, [n1, n2]) => {
    const ap = hlc3(b), esa = ema(ap, n1), d = ema(op(ap, esa, (x, y) => Math.abs(x - y)), n1);
    const wt1 = ema(ap.map((x, i) => (esa[i] == null || d[i] == null ? null : d[i] ? (x - esa[i]!) / (0.015 * d[i]!) : 0)), n2), wt2 = sma(wt1, 4);
    const diff = op(wt1, wt2, (x, y) => x - y);
    const cross = diff.map((x, i) => (!i || x == null || diff[i - 1] == null || x === 0 || x > 0 === diff[i - 1]! > 0 ? null : wt2[i]));
    return [
      { name: "差", data: diff, color: "", type: "hist", colors: diff.map((x) => (x == null ? null : (x >= 0 ? UPC : DNC) + "55")), hide: true },
      L("WT1", wt1, "#4fd1c5"), L("WT2", wt2, "#f06292", "line", true),
      { name: "交叉", data: cross, color: "", type: "dots", colors: cross.map((x, i) => (x == null ? null : diff[i]! > 0 ? UPC : DNC)), hide: true },
    ];
  } },
  { id: "wvf", name: "威廉 VIX 恐慌指標", abbr: "WVF", cat: "熱門腳本", overlay: false, params: [22, 20, 2, 50, 0.85], labels: ["高點回看", "布林週期", "布林倍數", "百分位回看", "百分位"],
    desc: "模擬 VIX：近期最高收盤到今天低點跌了幾 %；柱子變橘＝恐慌異常，常出現在底部附近（CM Williams Vix Fix 概念）", calc: (b, [pd, bl, mult, lb, ph]) => {
    const hc = highest(close(b), pd);
    const wvf = b.map((x, i) => (hc[i] == null ? null : ((hc[i]! - x.low) / hc[i]!) * 100));
    const ub = op(sma(wvf, bl), stdev(wvf, bl), (m, s) => m + mult * s);
    const rh = map(highest(wvf.map((x) => nz(x)), lb), (x) => x * ph);
    const hot = wvf.map((x, i) => x != null && ((ub[i] != null && x >= ub[i]!) || (rh[i] != null && x >= rh[i]!)));
    return [
      { name: "WVF", data: wvf, color: "", type: "hist", colors: wvf.map((x, i) => (x == null ? null : hot[i] ? "#f2994a" : "#646a73")) },
      L("布林上軌", ub, "#5aa9ff", "line", true), L("高百分位", rh, "#b48cff", "line", true),
    ];
  } },
  { id: "utbot", name: "UT Bot 買賣訊號", abbr: "UT Bot", cat: "熱門腳本", overlay: true, params: [1, 10], labels: ["敏感度（越大訊號越少）", "ATR 週期"],
    desc: "ATR 移動停損線（紅＝多方、綠＝空方），收盤穿越時標「買／賣」（QuantNomad 概念）", calc: (b, [k, n]) => {
    const a = atrV(b, n), c = close(b), ts: V = [];
    let prev = 0;
    c.forEach((x, i) => {
      if (a[i] == null) { ts.push(null); return; }
      const loss = k * a[i]!, x1 = i ? c[i - 1] : x;
      const s = x > prev && x1 > prev ? Math.max(prev, x - loss) : x < prev && x1 < prev ? Math.min(prev, x + loss) : x > prev ? x - loss : x + loss;
      ts.push(s); prev = s;
    });
    const marks: Mark[] = [];
    ts.forEach((s, i) => {
      if (s == null || !i || ts[i - 1] == null) return;
      if (c[i] > s && c[i - 1] <= ts[i - 1]!) marks.push({ i, buy: true, text: "買" });
      else if (c[i] < s && c[i - 1] >= ts[i - 1]!) marks.push({ i, buy: false, text: "賣" });
    });
    return [
      { name: "停損", data: ts, color: "#e0b341", colors: ts.map((s, i) => (s == null ? null : c[i] > s ? UPC : DNC)) },
      { name: "訊號", data: [], color: "", type: "marks", marks, hide: true },
    ];
  } },
  { id: "bbrsi", name: "布林＋RSI 雙重策略", abbr: "BB+RSI", cat: "熱門腳本", overlay: true, params: [6, 50, 50, 200, 2], labels: ["RSI 週期", "RSI 買進線", "RSI 賣出線", "布林週期", "布林倍數"],
    desc: "同一根 RSI 上穿買進線且收盤上穿布林下軌＝買；RSI 下穿賣出線且收盤下穿上軌＝賣。條件嚴格、訊號少是正常的（ChartArt 概念）", calc: (b, [rn, lo, hi, bn, bk]) => {
    const c = close(b), r = rsi(c, rn), m = sma(c, bn), sd = stdev(c, bn);
    const up = op(m, sd, (x, s) => x + bk * s), dn = op(m, sd, (x, s) => x - bk * s);
    const crossUp = (a: V, lv: V, i: number) => a[i] != null && a[i - 1] != null && lv[i] != null && lv[i - 1] != null && a[i]! > lv[i]! && a[i - 1]! <= lv[i - 1]!;
    const loV = b.map(() => lo), hiV = b.map(() => hi);
    const marks: Mark[] = [];
    for (let i = 1; i < b.length; i++) {
      if (crossUp(r, loV, i) && crossUp(c, dn, i)) marks.push({ i, buy: true, text: "買" });
      else if (crossUp(hiV, r, i) && crossUp(up, c, i)) marks.push({ i, buy: false, text: "賣" });
    }
    return [...[band("上軌", up), band("中軌", m), band("下軌", dn)].map((l) => ({ ...l, noScale: true })), { name: "訊號", data: [], color: "", type: "marks", marks, hide: true }];
  } },
  // SMC（Smart Money Concepts）：照 LuxAlgo／EmreKb 腳本的概念自己重寫，拆成幾個可以分開開關的指標
  { id: "smc", name: "SMC 市場結構", abbr: "SMC BOS/CHoCH", cat: "熱門腳本", overlay: true, params: [20, 5], labels: ["波段擺動", "內部擺動"],
    desc: "收盤突破前一個擺動高／低點：順勢叫 BOS、轉向叫 CHoCH；實線＝波段、虛線＝內部結構；最右邊標強高／弱高、強低／弱低", calc: (b, [sl, il]) => {
    const sw = smcStructure(b, sl), inn = smcStructure(b, il);
    const seen = new Set(sw.events.map((e) => `${e.to}:${e.price}`));
    const seg = (e: SmcEvent, internal: boolean): Shape => ({
      k: "seg", i1: e.from, p1: e.price, i2: e.to, p2: e.price, color: e.bull ? UPC : DNC, dash: internal, small: internal,
      text: e.choch ? "CHoCH" : "BOS", below: !e.bull,
    });
    const shapes: Shape[] = [
      ...inn.events.filter((e) => !seen.has(`${e.to}:${e.price}`)).slice(-40).map((e) => seg(e, true)),
      ...sw.events.slice(-40).map((e) => seg(e, false)),
    ];
    const t = sw.trend;
    if (sw.lastHigh) shapes.push({ k: "seg", i1: sw.lastHigh.i, p1: sw.lastHigh.p, i2: null, p2: sw.lastHigh.p, color: DNC, dash: true, text: t === -1 ? "強高" : "弱高", textAt: "end" });
    if (sw.lastLow) shapes.push({ k: "seg", i1: sw.lastLow.i, p1: sw.lastLow.p, i2: null, p2: sw.lastLow.p, color: UPC, dash: true, text: t === 1 ? "強低" : "弱低", textAt: "end", below: true });
    return [{ name: "結構", data: [], color: "", type: "shapes", shapes, hide: true }];
  } },
  { id: "smcob", name: "SMC 訂單塊", abbr: "Order Block", cat: "熱門腳本", overlay: true, params: [20, 3], labels: ["擺動週期", "多空各顯示幾個"],
    desc: "結構突破前最後一段反向走勢的 K 棒區間（大戶進場區）；收盤跌破（多）／站上（空）就失效不再顯示", calc: (b, [sl, cnt]) => {
    const { obs } = smcStructure(b, sl);
    const live = obs.filter((o) => o.end == null);
    const pick = (bull: boolean) => live.filter((o) => o.bull === bull).slice(-cnt);
    const shapes: Shape[] = [...pick(true), ...pick(false)].map((o) => ({ k: "box", i1: o.i, i2: null, top: o.top, bot: o.bot, color: o.bull ? UPC : DNC, text: o.bull ? "多方訂單塊" : "空方訂單塊" }));
    return [{ name: "訂單塊", data: [], color: "", type: "shapes", shapes, hide: true }];
  } },
  { id: "fvg", name: "SMC 公允價值缺口", abbr: "FVG", cat: "熱門腳本", overlay: true, params: [0.3, 5], labels: ["最小缺口 %", "多空各顯示幾個"],
    desc: "三根 K 棒中，第 1 根高點和第 3 根低點沒有重疊的空隙（反之為空方）；價格回補滿就消失", calc: (b, [th, cnt]) => {
    const g: { i: number; top: number; bot: number; bull: boolean }[] = [];
    for (let i = 2; i < b.length; i++) {
      const a = b[i - 2], m = b[i - 1], c = b[i];
      if (c.low > a.high && m.close > a.high && ((c.low - a.high) / m.close) * 100 >= th) g.push({ i: i - 1, top: c.low, bot: a.high, bull: true });
      else if (c.high < a.low && m.close < a.low && ((a.low - c.high) / m.close) * 100 >= th) g.push({ i: i - 1, top: a.low, bot: c.high, bull: false });
    }
    const open = g.filter((x) => { for (let t = x.i + 2; t < b.length; t++) if (x.bull ? b[t].low <= x.bot : b[t].high >= x.top) return false; return true; });
    const pick = (bull: boolean) => open.filter((x) => x.bull === bull).slice(-cnt);
    const shapes: Shape[] = [...pick(true), ...pick(false)].map((x) => ({ k: "box", i1: x.i, i2: null, top: x.top, bot: x.bot, color: x.bull ? "#f2994a" : "#4fd1c5", alpha: 0.18, text: "FVG" }));
    return [{ name: "FVG", data: [], color: "", type: "shapes", shapes, hide: true }];
  } },
  { id: "smcpd", name: "SMC 溢價／折價區", abbr: "Premium/Discount", cat: "熱門腳本", overlay: true, params: [60], labels: ["回看幾根"],
    desc: "最近 N 根的高低區間：上緣 5% 溢價區（偏貴）、中間平衡區、下緣 5% 折價區（偏便宜）", calc: (b, [n]) => {
    const seg = b.slice(-n); if (seg.length < 5) return [];
    const top = Math.max(...seg.map((x) => x.high)), bot = Math.min(...seg.map((x) => x.low)), i1 = b.length - seg.length;
    const at = (r: number) => bot + (top - bot) * r;
    const shapes: Shape[] = [
      { k: "box", i1, i2: null, top, bot: at(0.95), color: DNC, alpha: 0.12, text: "溢價區" },
      { k: "box", i1, i2: null, top: at(0.525), bot: at(0.475), color: "#9aa0a8", alpha: 0.12, text: "平衡區" },
      { k: "box", i1, i2: null, top: at(0.05), bot, color: UPC, alpha: 0.12, text: "折價區" },
    ];
    return [{ name: "區間", data: [], color: "", type: "shapes", shapes, hide: true }];
  } },
  { id: "srb", name: "支撐壓力突破", abbr: "S&R Breaks", cat: "熱門腳本", overlay: true, params: [15, 15, 20], labels: ["左邊幾根", "右邊幾根", "量能門檻 %"],
    desc: "擺動高低點畫成壓力（綠）／支撐（紅）線；收盤帶量（5、10 日均量差 ≥ 門檻）突破或跌破時標記；大型股量很穩，訊號少可把門檻調低到 0（LuxAlgo 概念）", calc: (b, [lb, rb, vth]) => {
    const { hi, lo } = pivots(b, lb, rb);
    const v = b.map((x) => x.volume), e5 = ema(v, 5), e10 = ema(v, 10);
    const osc = op(e5, e10, (x, y) => (y ? ((x - y) / y) * 100 : 0));
    const shapes: Shape[] = [], marks: Mark[] = [];
    const level = (ps: { i: number; p: number }[], res: boolean) => {
      ps.forEach((q, k) => {
        const next = ps[k + 1]?.i ?? null;
        let broke: number | null = null;
        for (let t = q.i + rb + 1; t < b.length && (next == null || t < next + rb + 1); t++) {
          const crossed = res ? b[t].close > q.p && b[t - 1].close <= q.p : b[t].close < q.p && b[t - 1].close >= q.p;
          if (crossed && nz(osc[t]) >= vth) { broke = t; break; }
        }
        if (broke != null) marks.push({ i: broke, buy: res, text: res ? "突破" : "跌破" });
        shapes.push({ k: "seg", i1: q.i, p1: q.p, i2: next ?? null, p2: q.p, color: res ? DNC : UPC, width: 2 });
      });
    };
    level(hi.slice(-30), true); level(lo.slice(-30), false);
    return [{ name: "線", data: [], color: "", type: "shapes", shapes, hide: true }, { name: "訊號", data: [], color: "", type: "marks", marks, hide: true }];
  } },
  { id: "tlb", name: "趨勢線突破", abbr: "Trendlines", cat: "熱門腳本", overlay: true, params: [14, 1], labels: ["擺動週期", "斜率倍數"],
    desc: "從擺動高點往下、擺動低點往上畫斜線（斜率＝ATR÷週期×倍數），收盤穿越時標「突破／跌破」（LuxAlgo 概念）", calc: (b, [len, mult]) => {
    const { hi, lo } = pivots(b, len, len);
    const a = atrV(b, len), c = close(b), last = b.length - 1;
    const shapes: Shape[] = [], marks: Mark[] = [];
    const run = (ps: { i: number; p: number }[], down: boolean) => {
      ps.slice(-30).forEach((q, k, arr) => {
        const slope = (nz(a[q.i + len] ?? a[q.i]) / len) * mult;
        const at = (t: number) => (down ? q.p - slope * (t - q.i) : q.p + slope * (t - q.i));
        const stop = arr[k + 1] ? arr[k + 1].i + len : last + 1;
        let end: number | null = null;
        for (let t = q.i + len + 1; t < Math.min(stop, b.length); t++) {
          if (down ? c[t] > at(t) && c[t - 1] <= at(t - 1) : c[t] < at(t) && c[t - 1] >= at(t - 1)) { end = t; break; }
        }
        if (end != null) marks.push({ i: end, buy: down, text: down ? "突破" : "跌破" });
        // 只畫被突破的線（畫到突破那根）和最新一條（往右延伸）；沒被突破就被新擺動點取代的舊線不畫，免得留在很遠的地方
        if (end == null && arr[k + 1]) return;
        const i2 = end ?? last + 5;
        shapes.push({ k: "seg", i1: q.i, p1: q.p, i2, p2: at(i2), color: down ? DNC : UPC, width: 1.5, dash: end == null });
      });
    };
    run(hi, true); run(lo, false);
    return [{ name: "趨勢線", data: [], color: "", type: "shapes", shapes, hide: true }, { name: "訊號", data: [], color: "", type: "marks", marks, hide: true }];
  } },
  { id: "macdmtf", name: "MACD 多週期", abbr: "MACD MTF", cat: "熱門腳本", overlay: false, params: [12, 26, 9, 1], labels: ["快線", "慢線", "訊號", "週期：1 同圖 2 日 3 週 4 月"],
    desc: "可以在小週期圖上看大週期的 MACD（例如 60 分 K 看日線、日 K 看週線）；柱子四色、快線在訊號線上方變紅，交叉打點（ChrisMoody 概念）", levels: [0], calc: (b, [f, sl, g, tf]) => {
    const key = groupKey(b, tf);
    const kf = 2 / (f + 1), ks = 2 / (sl + 1), kg = 2 / (g + 1);
    // 大週期還沒走完的那一根，用目前為止的收盤即時算（不偷看未來）
    let pf: number | null = null, ps: number | null = null, pg: number | null = null, cf = 0, cs = 0, cg = 0;
    const dif: V = [], dea: V = [];
    b.forEach((x, i) => {
      if (i && key[i] !== key[i - 1]) { pf = cf; ps = cs; pg = cg; }
      cf = pf == null ? x.close : x.close * kf + pf * (1 - kf);
      cs = ps == null ? x.close : x.close * ks + ps * (1 - ks);
      const d = cf - cs;
      cg = pg == null ? d : d * kg + pg * (1 - kg);
      dif.push(d); dea.push(cg);
    });
    const hist = op(dif, dea, (x, y) => x - y);
    const cross = hist.map((h, i) => (!i || h == null || hist[i - 1] == null || h === 0 || h > 0 === hist[i - 1]! > 0 ? null : dif[i]));
    return [
      { name: "柱", data: hist, color: "", type: "hist", colors: dimHist(hist) },
      { name: "DIF", data: dif, color: "#e0b341", colors: hist.map((h) => (h == null ? null : h >= 0 ? UPC : DNC)) },
      L("DEA", dea, "#5aa9ff"),
      { name: "交叉", data: cross, color: "", type: "dots", colors: cross.map((x, i) => (x == null ? null : hist[i]! > 0 ? UPC : DNC)), hide: true },
    ];
  } },
  { id: "pivhl", name: "前高前低＋樞紐點", abbr: "Pivots", cat: "熱門腳本", overlay: true, params: [5], labels: ["顯示幾期"],
    desc: "上一期的最高（綠）、最低（紅）與樞紐點 P＝(高+低+收)÷3（灰虛線）畫在這一期；分 K 用前一日＋前一週、日 K 用前一週＋前一月、週 K 以上用前一月", calc: (b, [n]) => {
    if (b.length < 2) return [];
    const intra = isIntraday(b), wk = !intra && b[1].time - b[0].time >= 5 * 86400;
    const shapes: Shape[] = [];
    const draw = (tf: number, cnt: number, name: string, thick: boolean) => {
      const key = groupKey(b, tf);
      const gs: { s: number; e: number; h: number; l: number; c: number }[] = [];
      b.forEach((x, i) => {
        const g = gs[gs.length - 1];
        if (!g || key[i] !== key[i - 1]) gs.push({ s: i, e: i, h: x.high, l: x.low, c: x.close });
        else { g.e = i; g.h = Math.max(g.h, x.high); g.l = Math.min(g.l, x.low); g.c = x.close; }
      });
      const from = Math.max(1, gs.length - cnt);
      for (let k = from; k < gs.length; k++) {
        const pv = gs[k - 1], cur = gs[k], latest = k === gs.length - 1;
        const i2 = latest ? b.length - 1 + 5 : cur.e + 1;
        const pp = (pv.h + pv.l + pv.c) / 3;
        const line = (p: number, color: string, label: string, dash: boolean, below = false): Shape =>
          ({ k: "seg", i1: cur.s, p1: p, i2, p2: p, color, dash, width: thick ? 1.5 : 1, text: latest ? label : undefined, textAt: "end", below, small: !thick });
        shapes.push(line(pv.h, DNC, `${name}高`, thick), line(pv.l, UPC, `${name}低`, thick, true));
        if (!thick) shapes.push(line(pp, "#9aa0a8", "P", true));
      }
    };
    if (intra) { draw(2, n, "前日", false); draw(3, 1, "前週", true); }
    else if (!wk) { draw(3, n, "前週", false); draw(4, 1, "前月", true); }
    else draw(4, n, "前月", false);
    return [{ name: "前高前低", data: [], color: "", type: "shapes", shapes, hide: true }];
  } },
];
export const IND = Object.fromEntries(INDICATORS.map((x) => [x.id, x]));

// ---------- 需要狀態的計算 ----------

/** 把 K 棒分組成大週期：1 同圖（每根一組）2 日 3 週（週一開始）4 月。時間已是台灣時間 */
function groupKey(b: Bar[], tf: number): number[] {
  return b.map((x, i) => {
    const day = Math.floor(x.time / 86400);
    if (tf === 2) return day;
    if (tf === 3) return Math.floor((day + 3) / 7);
    if (tf === 4) { const d = new Date(x.time * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); }
    return i;
  });
}
/** 擺動高低點：左邊 l 根都比它低（高）、右邊 r 根不超過它 */
function pivots(b: Bar[], l: number, r: number) {
  const hi: { i: number; p: number }[] = [], lo: { i: number; p: number }[] = [];
  for (let j = l; j + r < b.length; j++) {
    let h = true, w = true;
    for (let k = 1; k <= Math.max(l, r) && (h || w); k++) {
      if (k <= l) { if (b[j - k].high >= b[j].high) h = false; if (b[j - k].low <= b[j].low) w = false; }
      if (k <= r) { if (b[j + k].high > b[j].high) h = false; if (b[j + k].low < b[j].low) w = false; }
    }
    if (h) hi.push({ i: j, p: b[j].high });
    if (w) lo.push({ i: j, p: b[j].low });
  }
  return { hi, lo };
}
type SmcEvent = { from: number; to: number; price: number; bull: boolean; choch: boolean };
type SmcOb = { i: number; at: number; top: number; bot: number; bull: boolean; end: number | null };
/** SMC 市場結構：擺動點在右邊 len 根後才確認（不偷看未來），收盤穿越最近一個沒被破的擺動點＝結構突破 */
function smcStructure(b: Bar[], len: number) {
  const { hi, lo } = pivots(b, len, len);
  const events: SmcEvent[] = [], obs: SmcOb[] = [];
  let hk = 0, lk = 0, trend = 0;
  let sh: { i: number; p: number; done: boolean } | null = null, sl: { i: number; p: number; done: boolean } | null = null;
  for (let t = 0; t < b.length; t++) {
    while (hk < hi.length && hi[hk].i + len <= t) { sh = { ...hi[hk], done: false }; hk++; }
    while (lk < lo.length && lo[lk].i + len <= t) { sl = { ...lo[lk], done: false }; lk++; }
    const c = b[t].close;
    if (sh && !sh.done && c > sh.p) {
      events.push({ from: sh.i, to: t, price: sh.p, bull: true, choch: trend === -1 });
      let k = sh.i; for (let j = sh.i; j < t; j++) if (b[j].low < b[k].low) k = j;
      obs.push({ i: k, at: t, top: b[k].high, bot: b[k].low, bull: true, end: null });
      trend = 1; sh.done = true;
    }
    if (sl && !sl.done && c < sl.p) {
      events.push({ from: sl.i, to: t, price: sl.p, bull: false, choch: trend === 1 });
      let k = sl.i; for (let j = sl.i; j < t; j++) if (b[j].high > b[k].high) k = j;
      obs.push({ i: k, at: t, top: b[k].high, bot: b[k].low, bull: false, end: null });
      trend = -1; sl.done = true;
    }
  }
  for (const o of obs) for (let t = o.at + 1; t < b.length; t++) if (o.bull ? b[t].close < o.bot : b[t].close > o.top) { o.end = t; break; }
  // 強高／弱高：最近一個擺動點之後實際出現過的最高／最低（還沒被確認成擺動點的新高也算）
  const trail = (ps: { i: number; p: number }[], up: boolean) => {
    if (!ps.length) return null;
    let k = ps[ps.length - 1].i;
    for (let j = k; j < b.length; j++) if (up ? b[j].high > b[k].high : b[j].low < b[k].low) k = j;
    return { i: k, p: up ? b[k].high : b[k].low };
  };
  const lastHigh = trail(hi, true), lastLow = trail(lo, false);
  return { events, obs, trend, lastHigh, lastLow };
}

function isIntraday(b: Bar[]) { return b.length > 1 && b[1].time - b[0].time < 86400; }
function linreg(a: V, n: number): V {
  return a.map((_, i) => {
    if (i < n - 1) return null;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let j = 0; j < n; j++) { const y = a[i - n + 1 + j]; if (y == null) return null; sx += j; sy += y; sxy += j * y; sxx += j * j; }
    const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return (sy - m * sx) / n + m * (n - 1);
  });
}
function rsi(a: V, n: number): V {
  const ch = change(a), up = rma(map(ch, (x) => Math.max(x, 0)), n), dn = rma(map(ch, (x) => Math.max(-x, 0)), n);
  return op(up, dn, (u, d) => (d === 0 ? 100 : 100 - 100 / (1 + u / d)));
}
function mfv(b: Bar[]): V { return b.map((x) => (x.high > x.low ? ((x.close - x.low - (x.high - x.close)) / (x.high - x.low)) * x.volume : 0)); }
function dmi(b: Bar[], n: number, s: number) {
  const pdm = b.map((x, i) => { if (!i) return 0; const u = x.high - b[i - 1].high, d = b[i - 1].low - x.low; return u > d && u > 0 ? u : 0; });
  const mdm = b.map((x, i) => { if (!i) return 0; const u = x.high - b[i - 1].high, d = b[i - 1].low - x.low; return d > u && d > 0 ? d : 0; });
  const t = rma(tr(b), n), pdi = op(rma(pdm, n), t, (x, y) => (y ? (100 * x) / y : 0)), mdi = op(rma(mdm, n), t, (x, y) => (y ? (100 * x) / y : 0));
  const dx = op(pdi, mdi, (p, m) => (p + m ? (100 * Math.abs(p - m)) / (p + m) : 0));
  return { pdi, mdi, adx: rma(dx, s) };
}
function psar(b: Bar[], start: number, inc: number, max: number): V {
  if (b.length < 3) return b.map(() => null);
  const out: V = [null];
  let up = b[1].close >= b[0].close, af = start, ep = up ? b[0].high : b[0].low, sar = up ? b[0].low : b[0].high;
  for (let i = 1; i < b.length; i++) {
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, b[i - 1].low, i > 1 ? b[i - 2].low : b[i - 1].low);
      if (b[i].low < sar) { up = false; sar = ep; ep = b[i].low; af = start; }
      else if (b[i].high > ep) { ep = b[i].high; af = Math.min(max, af + inc); }
    } else {
      sar = Math.max(sar, b[i - 1].high, i > 1 ? b[i - 2].high : b[i - 1].high);
      if (b[i].high > sar) { up = true; sar = ep; ep = b[i].high; af = start; }
      else if (b[i].low < ep) { ep = b[i].low; af = Math.min(max, af + inc); }
    }
    out.push(sar);
  }
  return out;
}
function supertrend(b: Bar[], n: number, k: number) {
  const a = atrV(b, n), m = hl2(b);
  const up: V = [], dn: V = [];
  let fu = 0, fl = 0, trend = 1;
  b.forEach((x, i) => {
    if (a[i] == null) { up.push(null); dn.push(null); return; }
    const bu = m[i]! + k * a[i]!, bl = m[i]! - k * a[i]!;
    const pc = i ? b[i - 1].close : x.close;
    fu = !fu || bu < fu || pc > fu ? bu : fu;
    fl = !fl || bl > fl || pc < fl ? bl : fl;
    if (trend === 1 && x.close < fl) trend = -1; else if (trend === -1 && x.close > fu) trend = 1;
    up.push(trend === 1 ? fl : null); dn.push(trend === -1 ? fu : null);
  });
  return { up, dn };
}
export { nz };

/** 指標設定（存在瀏覽器）：啟用的指標與參數 */
export type IndSetting = { id: string; params: number[] };
export const DEFAULT_INDS: IndSetting[] = [{ id: "ma", params: [5, 20, 60] }, { id: "vol", params: [5, 20] }];
/** 量價四步：RVOL → 推進效率 → 吸收候選 → POC */
export const FOUR_STEP: IndSetting[] = [
  { id: "ma", params: [5, 20, 60] }, { id: "vol", params: [5, 20] },
  { id: "rvol", params: [20, 2] }, { id: "er", params: [20, 2, 0.3] }, { id: "abs", params: [20, 2, 0.3, 20] }, { id: "poc", params: [100, 24, 70] },
];
