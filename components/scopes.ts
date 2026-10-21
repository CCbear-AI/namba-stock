"use client";
// 「範圍」與內建群組：全市場／上市／上櫃／0050 權值股／自選群組／創歷史新高／近 20 日漲超 20%
import type { ScanRow } from "@/lib/scan";
import type { Group } from "./hooks";

/** 0050 權值股：上市市值前 50 大（台灣 50 指數的選股邏輯），依市值排序 */
export const top50 = (rows: ScanRow[]) => rows.filter((r) => r.m === "tse").sort((a, b) => b.cap - a.cap).slice(0, 50);
export const athRows = (rows: ScanRow[]) => rows.filter((r) => r.ath > 0 && r.vol > 0 && r.price > r.ath).sort((a, b) => b.pct - a.pct);
export const d20Rows = (rows: ScanRow[]) => rows.filter((r) => r.d20 >= 20).sort((a, b) => b.d20 - a.d20);

export function builtinCodes(id: string, rows: ScanRow[]) {
  if (id === "b-0050") return top50(rows).map((r) => r.c);
  if (id === "b-ath") return athRows(rows).map((r) => r.c);
  if (id === "b-d20") return d20Rows(rows).map((r) => r.c);
  return [];
}

export type Scope = { id: string; label: string; filter: (rows: ScanRow[]) => ScanRow[] };
export function scopes(rows: ScanRow[], groups: Group[]): Scope[] {
  const pick = (codes: string[]) => { const s = new Set(codes); return (rs: ScanRow[]) => rs.filter((r) => s.has(r.c)); };
  return [
    { id: "all", label: "全市場", filter: (rs) => rs },
    { id: "tse", label: "上市", filter: (rs) => rs.filter((r) => r.m === "tse") },
    { id: "otc", label: "上櫃", filter: (rs) => rs.filter((r) => r.m === "otc") },
    { id: "b-0050", label: "0050 權值股", filter: () => top50(rows) },
    ...groups.map((g) => ({ id: g.id, label: `${g.name}（${g.codes.length}）`, filter: pick(g.codes) })),
    { id: "b-ath", label: `創歷史新高（${athRows(rows).length}）`, filter: () => athRows(rows) },
    { id: "b-d20", label: `近20日漲超20%（${d20Rows(rows).length}）`, filter: () => d20Rows(rows) },
  ];
}
