// 選股條件、快速策略、飆股訊號標籤（前後端與提醒共用）
import type { ScanRow } from "./scan";

export const isLimitUp = (r: ScanRow) => r.up > 0 && r.price >= r.up && r.vol > 0;
export const isLimitDown = (r: ScanRow) => r.down > 0 && r.price <= r.down && r.vol > 0;
/** 漲停鎖住：成交在漲停且賣方沒有掛單 */
export const lockedUp = (r: ScanRow) => isLimitUp(r) && !r.ask1;
export const lockedDown = (r: ScanRow) => isLimitDown(r) && !r.bid1;
/** 曾觸及漲停後打開 */
export const openedUp = (r: ScanRow) => r.up > 0 && r.high >= r.up && r.price < r.up && r.vol > 0;
export const openedDown = (r: ScanRow) => r.down > 0 && r.low <= r.down && r.price > r.down && r.vol > 0;
/** 推進效率＝結果 ÷ 努力；結果＝今日漲跌幅 ÷ 近 20 日平均日漲跌幅，努力＝同時段 RVOL */
export const efficiency = (r: ScanRow) => (r.move20 > 0 && r.rvol > 0 ? Math.abs(r.pct) / r.move20 / r.rvol : 0);
/** 量價齊揚：RVOL ≥ 1.5、推進效率 ≥ 1、今日上漲（放量而且價格確實被推上去） */
export const volPriceUp = (r: ScanRow) => r.rvol >= 1.5 && r.pct > 0 && efficiency(r) >= 1;
/** 爆量卡關（爆量沒推進）：RVOL ≥ 2，但漲跌不到平常日波幅（近 20 日平均每日漲跌幅）的三成 */
export const volStall = (r: ScanRow) => r.rvol >= 2 && r.move20 > 0 && Math.abs(r.pct) < r.move20 * 0.3;
// 新高：收盤 ≥ 前 N 日最高收盤；新低：收盤 ≤ 前 N 日最低收盤（跟里長伯的算法一致）
const newHigh = (r: ScanRow, hi: number) => hi > 0 && r.vol > 0 && r.price >= hi;
const newLow = (r: ScanRow, lo: number) => lo > 0 && r.vol > 0 && r.price <= lo;
const above = (p: number, ma: number) => ma > 0 && p > ma;

export type Cond = { id: string; label: string; test: (r: ScanRow) => boolean };
export const CONDS: Cond[] = [
  { id: "pct5", label: "漲幅 ≥ 5%", test: (r) => r.pct >= 5 },
  { id: "vr2", label: "量比 ≥ 2 倍", test: (r) => r.vr >= 2 },
  { id: "rvol2", label: "RVOL ≥ 2（同時段）", test: (r) => r.rvol >= 2 },
  { id: "rvol3", label: "RVOL ≥ 3（同時段）", test: (r) => r.rvol >= 3 },
  { id: "vpu", label: "量價齊揚", test: volPriceUp },
  { id: "stall", label: "爆量沒推進", test: volStall },
  { id: "f3", label: "外資連買 ≥ 3 日", test: (r) => r.fDays >= 3 },
  { id: "t3", label: "投信連買 ≥ 3 日", test: (r) => r.tDays >= 3 },
  { id: "ma20", label: "站上 20 日線", test: (r) => above(r.price, r.ma20) },
  { id: "hi60", label: "創 60 日新高", test: (r) => newHigh(r, r.hi60) },
  { id: "hi20", label: "創 20 日新高", test: (r) => newHigh(r, r.hi20) },
  { id: "hi120", label: "創半年新高（120 日）", test: (r) => newHigh(r, r.hi120) },
  { id: "ath", label: "創歷史新高", test: (r) => r.ath > 0 && r.vol > 0 && r.price >= r.ath },
  { id: "vol3k", label: "量 ≥ 3,000 張", test: (r) => r.vol >= 3000 },
  { id: "limup", label: "今日漲停", test: isLimitUp },
  { id: "ma60", label: "站上 60 日線", test: (r) => above(r.price, r.ma60) },
  { id: "bull", label: "均線多頭排列", test: (r) => r.ma5 > r.ma20 && r.ma20 > r.ma60 && r.ma60 > 0 },
  { id: "d5m8", label: "近 5 日跌 ≥ 8%", test: (r) => r.d5 <= -8 },
  { id: "dn3", label: "今日跌 ≥ 3%", test: (r) => r.pct <= -3 },
  { id: "vshrink", label: "量縮（量比 ≤ 0.6）", test: (r) => r.vr > 0 && r.vr <= 0.6 },
  { id: "lo20", label: "創 20 日新低", test: (r) => newLow(r, r.lo20) },
  { id: "lo60", label: "創 60 日新低", test: (r) => newLow(r, r.lo60) },
  { id: "lo120", label: "創半年新低（120 日）", test: (r) => newLow(r, r.lo120) },
  { id: "atl", label: "創歷史新低", test: (r) => r.atl > 0 && r.vol > 0 && r.price < r.atl },
];
export const COND = Object.fromEntries(CONDS.map((c) => [c.id, c]));

export const STRATEGIES: { id: string; label: string; conds: string[] }[] = [
  { id: "rocket", label: "飆股起漲", conds: ["pct5", "vr2", "ma20"] },
  { id: "insti", label: "法人連買", conds: ["f3", "t3"] },
  { id: "limit", label: "漲停續強", conds: ["hi60", "limup"] },
  { id: "volbrk", label: "量增突破", conds: ["vr2", "ma20", "hi60", "vol3k"] },
  { id: "vpush", label: "量價推進", conds: ["rvol2", "vpu", "ma20"] },
];

export function matchAll(r: ScanRow, ids: string[]) {
  return r.vol > 0 && ids.every((id) => COND[id]?.test(r));
}

/** 均線／新高欄位：只顯示最重要的一個 */
export function hiTag(r: ScanRow) {
  if (r.ath > 0 && r.price >= r.ath) return "歷史新高";
  if (newHigh(r, r.hi120)) return "半年新高";
  if (newHigh(r, r.hi60)) return "60 日新高";
  if (newHigh(r, r.hi20)) return "20 日新高";
  if (above(r.price, r.ma20)) return "站上 20 日線";
  return "";
}

/** 飆股訊號標籤（首頁） */
export function signalTags(r: ScanRow): string[] {
  const t: string[] = [];
  if (r.limStreak >= 2) t.push(`連 ${r.limStreak} 日漲停`);
  else if (lockedUp(r)) t.push("漲停鎖住");
  else if (openedUp(r)) t.push("漲停打開");
  else if (r.up && r.price >= r.up * 0.985 && r.pct > 0) t.push("逼近漲停");
  if (r.tDays >= 3) t.push(`投信連買 ${r.tDays} 日`);
  else if (r.fDays >= 3) t.push(`外資連買 ${r.fDays} 日`);
  if (r.rvol >= 2 && r.pct >= 3 && volPriceUp(r)) t.push("爆量推進");
  else if (r.vr >= 2) t.push(`量增 ${r.vr.toFixed(1)} 倍`);
  if (newHigh(r, r.hi60)) t.push("創 60 日新高");
  else if (r.ma20 > 0 && r.prev <= r.ma20 && r.price > r.ma20) t.push("突破 20 日線");
  return t;
}
