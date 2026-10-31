// 預先算好的全市場體檢（scripts/checkup-all.ts 寫 data/checkup/latest.json），/api/checkup 先查這裡
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Checkup } from "./checkup";

export type CheckupAll = { date: string; generated: number; items: Record<string, Checkup & { ai?: string }> };
export const CHECKUP_FILE = path.join(process.cwd(), "data", "checkup", "latest.json");

// 記憶體快取 10 分鐘
let hit: { at: number; v: CheckupAll | null } | null = null;
export function precomputed(code: string, date: string) {
  if (!hit || Date.now() - hit.at > 10 * 60_000) hit = { at: Date.now(), v: existsSync(CHECKUP_FILE) ? JSON.parse(readFileSync(CHECKUP_FILE, "utf8")) : null };
  const x = hit.v?.items[code];
  return x && x.date === date ? x : null;
}
