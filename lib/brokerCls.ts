// 分點分類（scripts/broker-class.ts 每晚算好存 data/broker-class.json）
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type Cls = "rel" | "long" | "dip" | "chase" | "dt" | "bad" | "none";
export const CLS_NAME: Record<Cls, string> = { rel: "可靠放長", long: "放長", dip: "跌時買", chase: "追漲", dt: "隔日沖", bad: "壞分點", none: "沒成績" };
/** 安定籌碼＝可靠放長、放長、跌時買；浮動籌碼＝追漲、隔日沖、壞分點；沒成績不算 */
export const sideOf = (c: Cls): "s" | "f" | null => (c === "rel" || c === "long" || c === "dip" ? "s" : c === "none" ? null : "f");

export type ClsInfo = { cls: Cls; sell1: number; n: number; hold: number; x10: number; upR: number; recent: number; recentN: number };
let hit: { at: number; v: { asOf: string; from: string; m: Map<string, ClsInfo> } } | null = null;
export function getClass() {
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;
  const f = path.join(process.cwd(), "data", "broker-class.json");
  const m = new Map<string, ClsInfo>();
  let asOf = "", from = "";
  if (existsSync(f)) {
    const j = JSON.parse(readFileSync(f, "utf8")) as { asOf: string; from: string; b: Record<string, [Cls, number, number, number, number, number, number, number]> };
    asOf = j.asOf; from = j.from;
    for (const [id, [cls, sell1, n, hold, x10, upR, recent, recentN]] of Object.entries(j.b)) m.set(id, { cls, sell1, n, hold, x10, upR, recent, recentN });
  }
  hit = { at: Date.now(), v: { asOf, from, m } };
  return hit.v;
}
export const clsOf = (id: string): Cls => getClass().m.get(id)?.cls ?? "none";
