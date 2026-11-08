// 指數歷史日 K（data/sector-tse.json、data/sector-otc.json）：類股 K 線與「週末測試報價」改回官方收盤共用
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export type Store = { bars: Record<string, [string, number, number, number, number][]> };
const stores: Record<string, { at: number; s: Store }> = {};

export function load(market: "tse" | "otc" = "tse"): Store {
  const hit = stores[market];
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.s;
  const f = path.join(process.cwd(), "data", `sector-${market}.json`);
  const s: Store = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { bars: {} };
  stores[market] = { at: Date.now(), s };
  return s;
}

// 上櫃：MIS 名稱（櫃買半導體類指數）↔ 櫃買歷史名稱（半導體業）
const OTC_ALIAS: Record<string, string> = { 營建: "建材營造", 化工: "化學", 紡纖: "紡織纖維", 機械: "電機機械" };
const normName = (n: string) => n.replace(/^櫃買/, "").replace(/類指數$|指數$/, "").replace(/設備業$|工業$|業$/, "");
export function historyKey(name: string, market: "tse" | "otc") {
  const st = load(market);
  if (market === "tse") return st.bars[name] ? name : null;
  if (name === "櫃買指數") return st.bars[name] ? name : null;
  const want = OTC_ALIAS[normName(name)] ?? normName(name);
  return Object.keys(st.bars).find((k) => normName(k) === want) ?? null;
}
