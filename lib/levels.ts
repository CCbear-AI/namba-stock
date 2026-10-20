// 超級支撐壓力（程式計算版）
// 綜合三種線索找價位：1) 轉折高低點被碰幾次 2) 成交量最集中的價位 3) 整數關卡，
// 價位相近的合併成一區，依分數給 1～3 顆強度。
import type { Bar, Level } from "./types";

type Cand = { price: number; w: number; tags: Set<string>; touches: number; last: number };

function atr(bars: Bar[], n = 14) {
  let s = 0, k = 0;
  for (let i = Math.max(1, bars.length - n); i < bars.length; i++) {
    const b = bars[i], p = bars[i - 1].close;
    s += Math.max(b.high - b.low, Math.abs(b.high - p), Math.abs(b.low - p)); k++;
  }
  return k ? s / k : 0;
}

/** 依台股升降單位取整（指數留兩位小數） */
function toTick(p: number) {
  const t = p >= 10000 ? 0.01 : p >= 1000 ? 5 : p >= 500 ? 1 : p >= 100 ? 0.5 : p >= 50 ? 0.1 : p >= 10 ? 0.05 : 0.01;
  return Math.round(Math.round(p / t) * t * 100) / 100;
}

function roundStep(p: number) {
  if (p >= 1000) return 100; if (p >= 500) return 50; if (p >= 100) return 10;
  if (p >= 50) return 5; if (p >= 10) return 1; return 0.5;
}

export function superLevels(all: Bar[], fmt: (v: number) => string = (v) => v.toFixed(2)): { levels: Level[]; summary: string } {
  const bars = all.slice(-160);
  if (bars.length < 20) return { levels: [], summary: "K 線太少，無法判讀。" };
  const last = bars[bars.length - 1].close;
  const tol = Math.max(atr(bars) * 0.6, last * 0.006);
  const n = bars.length;
  const cands: Cand[] = [];
  const add = (price: number, w: number, tag: string, idx: number, touch = 0) =>
    cands.push({ price, w, tags: new Set([tag]), touches: touch, last: idx });

  // 1) 轉折點（左右各 3 根）
  const k = 3;
  for (let i = k; i < n - 1; i++) {
    const L = Math.max(0, i - k), R = Math.min(n - 1, i + k);
    let isH = true, isL = true;
    for (let j = L; j <= R; j++) {
      if (bars[j].high > bars[i].high) isH = false;
      if (bars[j].low < bars[i].low) isL = false;
    }
    const recency = 0.5 + i / n; // 越近越重要
    if (isH) add(bars[i].high, recency, "前高", i, 1);
    if (isL) add(bars[i].low, recency, "前低", i, 1);
  }

  // 2) 成交量分布（40 格），取明顯高於平均的格子
  const hi = Math.max(...bars.map((b) => b.high)), lo = Math.min(...bars.map((b) => b.low));
  const bins = 40, step = (hi - lo) / bins || 1;
  const vp = new Array(bins).fill(0);
  for (const b of bars) {
    const a = Math.floor((b.low - lo) / step), z = Math.min(bins - 1, Math.floor((b.high - lo) / step));
    for (let x = a; x <= z; x++) vp[x] += b.volume / (z - a + 1);
  }
  const avg = vp.reduce((s, v) => s + v, 0) / bins;
  const poc = vp.indexOf(Math.max(...vp));
  vp.forEach((v, i) => {
    const isPeak = v >= (vp[i - 1] ?? 0) && v >= (vp[i + 1] ?? 0);
    if (avg && v > avg * 1.4 && isPeak) add(lo + (i + 0.5) * step, 1.2 * (v / avg) * 0.6, i === poc ? "最大量價位" : "成交密集", n - 1);
  });

  // 3) 整數關卡（離現價 ±15% 內）
  const rs = roundStep(last) * 5;
  for (let p = Math.ceil((last * 0.85) / rs) * rs; p <= last * 1.15; p += rs) add(p, 0.6, "整數關卡", n - 1);

  // 合併相近價位
  cands.sort((a, b) => a.price - b.price);
  const zones: Cand[] = [];
  for (const c of cands) {
    const z = zones[zones.length - 1];
    if (z && c.price - z.price <= tol) {
      const w = z.w + c.w;
      z.price = (z.price * z.w + c.price * c.w) / w;
      z.w = w; z.touches += c.touches; z.last = Math.max(z.last, c.last);
      c.tags.forEach((t) => z.tags.add(t));
    } else zones.push({ ...c, tags: new Set(c.tags) });
  }
  // 只留有轉折或量能支持的區（單純整數關卡不算）
  const good = zones.filter((z) => z.touches > 0 || z.tags.has("成交密集") || z.tags.has("最大量價位"));
  for (const z of good) if (z.touches >= 2) z.w *= 1 + 0.25 * (z.touches - 1);

  const pick = (kind: Level["kind"]) =>
    good
      .filter((z) => (kind === "resistance" ? z.price > last * 1.003 : z.price < last * 0.997) && Math.abs(z.price / last - 1) < 0.3)
      .sort((a, b) => b.w - a.w)
      .slice(0, 3);
  const chosen = [...pick("resistance").map((z) => ({ z, kind: "resistance" as const })), ...pick("support").map((z) => ({ z, kind: "support" as const }))];
  const ws = chosen.map((c) => c.z.w).sort((a, b) => b - a);
  const top = ws[0] ?? 1;

  const levels: Level[] = chosen
    .map(({ z, kind }) => {
      const strength = (z.w >= top * 0.7 ? 3 : z.w >= top * 0.4 ? 2 : 1) as 1 | 2 | 3;
      const tags = [...z.tags].filter((t) => t !== "前高" && t !== "前低");
      const parts: string[] = [];
      if (z.touches) parts.push(`${kind === "resistance" ? "高點" : "低點"}碰過 ${z.touches} 次`.replace("碰過 1 次", "轉折點"));
      parts.push(...tags);
      if (n - 1 - z.last <= 10 && z.touches) parts.push("近期");
      return { kind, price: toTick(z.price), strength, note: parts.join("・") };
    })
    .sort((a, b) => b.price - a.price);

  const res = levels.filter((l) => l.kind === "resistance").sort((a, b) => a.price - b.price)[0];
  const sup = levels.filter((l) => l.kind === "support").sort((a, b) => b.price - a.price)[0];
  const strongSup = levels.filter((l) => l.kind === "support" && l.strength === 3)[0];
  const strongRes = levels.filter((l) => l.kind === "resistance" && l.strength === 3)[0];
  const pct = (p: number) => `${p > last ? "+" : ""}${(((p - last) / last) * 100).toFixed(1)}%`;
  const s: string[] = [`目前 ${fmt(last)}。`];
  if (res) s.push(`上方最近壓力 ${fmt(res.price)}（${pct(res.price)}）。`);
  else s.push("上方近期沒有明顯壓力，處在區間高檔。");
  if (sup) s.push(`下方最近支撐 ${fmt(sup.price)}（${pct(sup.price)}）。`);
  else s.push("下方近期沒有明顯支撐。");
  if (strongRes && strongRes !== res) s.push(`較強的壓力在 ${fmt(strongRes.price)}。`);
  if (strongSup && strongSup !== sup) s.push(`跌破 ${fmt(sup!.price)} 後，較強支撐在 ${fmt(strongSup.price)}。`);
  if (res && sup) {
    const up = res.price - last, dn = last - sup.price;
    s.push(up < dn ? "離壓力比較近，追價空間有限。" : "離支撐比較近，停損距離短。");
  }
  return { levels, summary: s.join("") };
}
