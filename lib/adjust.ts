// 還原權值（除權息）：除權息日以前的價格乘上係數，讓除息缺口不會被當成下跌。資料由 scripts/exright.ts 產生
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "exright.json");
let hit: { at: number; ev: Record<string, [string, number][]> } | null = null;
function events() {
  if (!hit || Date.now() - hit.at > 10 * 60_000) hit = { at: Date.now(), ev: existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")).ev : {} };
  return hit.ev;
}

const memo = new WeakMap<number[], number[]>();
/** 還原後的收盤序列（跟 dates 對齊；NaN 照舊）。只用資料期間內已經發生的除權息 */
export function adjClose(code: string, dates: string[], c: number[]): number[] {
  const m = memo.get(c);
  if (m) return m;
  const ev = (events()[code] ?? []).filter(([d]) => d > dates[0] && d <= dates[dates.length - 1]);
  if (!ev.length) { memo.set(c, c); return c; }
  const out = c.slice();
  let f = 1, k = ev.length - 1;
  for (let i = dates.length - 1; i >= 0; i--) {
    // 走到除權息日的前一天起，前面的價格都要乘上這次的係數
    while (k >= 0 && dates[i] < ev[k][0]) { f *= ev[k][1]; k--; }
    if (f !== 1 && !Number.isNaN(out[i])) out[i] = c[i] * f;
  }
  memo.set(c, out);
  return out;
}
