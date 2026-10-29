"use client";
// 分點頁、自選股「分點追蹤」共用：分點類型小圓點、分類標籤、追蹤清單
import { useSyncExternalStore } from "react";
import { localStore } from "@/components/hooks";
import { num } from "@/components/fmt";

export type K = "f" | "l";
export type Cls = "rel" | "long" | "dip" | "chase" | "dt" | "bad" | "none";

export const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
export const sg = (v: number) => `${v > 0 ? "+" : ""}${num(v)}`;
export const KC: Record<K, string> = { f: "#5b9cf0", l: "#c8d65a" };
export const KN: Record<K, string> = { f: "外資", l: "本土" };
export const DT = "#f0a14a"; // 隔日沖（橘）
export const Dot = ({ k, c }: { k: K; c?: Cls }) => <span title={c === "dt" ? "隔日沖" : KN[k]} className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0" style={{ background: c === "dt" ? DT : KC[k] }} />;
export const CN: Record<Cls, string> = { rel: "可靠放長", long: "放長", dip: "跌時買", chase: "追漲", dt: "隔日沖", bad: "壞分點", none: "" };
const STABLE: Cls[] = ["rel", "long", "dip"];
/** 分點分類小標：安定籌碼偏金、浮動籌碼灰、隔日沖橘 */
export const CTag = ({ c }: { c?: Cls }) => (c && c !== "none" ? <span className="ml-1.5 text-[11px] shrink-0" style={{ color: c === "dt" ? DT : STABLE.includes(c) ? "var(--gold-2)" : "var(--text-2)" }}>{CN[c]}</span> : null);
export const CLS_HELP = "分點分類（用近 70 個交易日各股前 15 名資料，每晚重算）：隔日沖＝買進的張數裡隔天就賣掉 25% 以上；壞分點＝買進後 10 天平均跑輸大盤 1.5% 以上；追漲＝七成以上買在上漲日；跌時買＝不到四成買在上漲日；可靠放長＝隔天幾乎不賣（≤10%）而且 5 天內大多沒賣回；放長＝其他。可靠放長、放長、跌時買算「安定籌碼」，追漲、隔日沖、壞分點算「浮動籌碼」；事件太少的是「沒成績」。";
export const streakText = (s: number) => (s >= 2 ? `連買 ${s} 天` : s <= -2 ? `連賣 ${-s} 天` : "");

// 追蹤清單（股票＋分點，存在這台裝置）
export type Track = { c: string; id: string; b: string };
const trackStore = localStore<Track[]>("namba.brokerTrack", () => []);
const NO_TRACK: Track[] = [];
export function useTrack() {
  const list = useSyncExternalStore(trackStore.subscribe, trackStore.read, () => NO_TRACK);
  const has = (c: string, id: string) => list.some((t) => t.c === c && t.id === id);
  return {
    list, has,
    toggle: (t: Track) => trackStore.write(has(t.c, t.id) ? list.filter((x) => !(x.c === t.c && x.id === t.id)) : [...list, t]),
  };
}
