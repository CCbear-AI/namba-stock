// 技術指標（74 個）。全部回傳跟 bars 對齊的陣列，算不出來的位置是 null
import type { Bar } from "./types";

export type V = (number | null)[];
export type Line = { name: string; data: V; color: string; type?: "line" | "hist" | "dots" | "area"; dash?: boolean };
export type Ind = {
  id: string; name: string; abbr: string; cat: Cat; overlay: boolean; params: number[]; labels?: string[]; desc: string;
  calc: (b: Bar[], p: number[]) => Line[];
  levels?: number[]; // 副圖參考線（例如 RSI 30/70）
};
export type Cat = "均線" | "通道與帶狀" | "趨勢" | "動能與震盪" | "趨勢強度" | "量能" | "波動" | "基本";
export const CATS: Cat[] = ["均線", "通道與帶狀", "趨勢", "動能與震盪", "趨勢強度", "量能", "波動"];

const C = ["#e0b341", "#5aa9ff", "#b48cff", "#4fd1c5", "#f2994a", "#f06292", "#9ccc65"];
const UPC = "#f0505a", DNC = "#22b573";

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
    return [L("上軌", op(m, sd, (x, y) => x + k * y), "#f2994a"), L("中軌", m, "#e0b341"), L("下軌", op(m, sd, (x, y) => x - k * y), "#5aa9ff")];
  } },
  { id: "kc", name: "Keltner 通道", abbr: "KC", cat: "通道與帶狀", overlay: true, params: [20, 2, 10], desc: "EMA ± 幾倍 ATR", calc: (b, [n, k, an]) => {
    const m = ema(close(b), n), a = atrV(b, an);
    return [L("上軌", op(m, a, (x, y) => x + k * y), "#f2994a"), L("中線", m, "#e0b341"), L("下軌", op(m, a, (x, y) => x - k * y), "#5aa9ff")];
  } },
  { id: "dc", name: "唐奇安通道", abbr: "DC", cat: "通道與帶狀", overlay: true, params: [20], desc: "N 根的最高價與最低價", calc: (b, [n]) => {
    const h = highest(b.map((x) => x.high), n), l = lowest(b.map((x) => x.low), n);
    return [L("上軌", h, "#f2994a"), L("中線", op(h, l, (x, y) => (x + y) / 2), "#e0b341", "line", true), L("下軌", l, "#5aa9ff")];
  } },
  { id: "env", name: "包絡線", abbr: "ENV", cat: "通道與帶狀", overlay: true, params: [20, 10], desc: "均線上下各幾 %", calc: (b, [n, k]) => {
    const m = sma(close(b), n);
    return [L("上軌", map(m, (x) => x * (1 + k / 100)), "#f2994a"), L("中線", m, "#e0b341"), L("下軌", map(m, (x) => x * (1 - k / 100)), "#5aa9ff")];
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
    return [L("空方停損", highest(fh, q), DNC), L("多方停損", lowest(fl, q), UPC)];
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
];
export const IND = Object.fromEntries(INDICATORS.map((x) => [x.id, x]));

// ---------- 需要狀態的計算 ----------
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
