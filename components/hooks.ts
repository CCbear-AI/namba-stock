"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ScanRow } from "@/lib/scan";

/** 定時抓 JSON；interval=0 只抓一次 */
export function usePoll<T>(url: string | null, interval = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        if (!stop) { setData(j); setError(j?.error ?? null); }
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      if (!stop && interval) timer = setTimeout(run, interval);
    };
    run();
    return () => { stop = true; clearTimeout(timer); };
  }, [url, interval]);
  return { data, error };
}

export type Scan = { time: number; open: boolean; rows: ScanRow[] };
/** 全市場掃描（盤中 30 秒更新） */
export const useScan = (interval = 30_000) => usePoll<Scan>("/api/scan", interval);

// ---- 存在這台裝置的小型狀態（多個元件共用、跨分頁同步） ----
function localStore<T>(key: string, init: () => T) {
  const listeners = new Set<() => void>();
  let cached: T | null = null;
  const read = (): T => {
    if (cached) return cached;
    try { const v = localStorage.getItem(key); cached = v ? JSON.parse(v) : init(); } catch { cached = init(); }
    return cached!;
  };
  const write = (v: T) => {
    cached = v;
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 無痕模式寫不進去就算了 */ }
    listeners.forEach((f) => f());
  };
  if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === key) { cached = null; listeners.forEach((f) => f()); } });
  const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
  return { read, write, subscribe };
}

// ---- 自選股群組 ----
export type Group = { id: string; name: string; codes: string[] };
/** 內建群組（自動產生、不能手動增減）：0050 權值股、創歷史新高、近 20 日漲超 20% */
export const BUILTIN = [
  { id: "b-0050", name: "0050 權值股" },
  { id: "b-ath", name: "創歷史新高" },
  { id: "b-d20", name: "近20日漲超20%" },
] as const;
type GroupState = { groups: Group[]; hidden: string[] };
const groupStore = localStore<GroupState>("namba.groups", () => {
  // 舊版只有一個自選清單
  let old: string[] = [];
  try { old = JSON.parse(localStorage.getItem("namba.watchlist") ?? "[]"); } catch { /* */ }
  return { groups: [{ id: "my", name: "我的自選", codes: old }], hidden: [] };
});
const EMPTY_STATE: GroupState = { groups: [{ id: "my", name: "我的自選", codes: [] }], hidden: [] };

export function useGroups() {
  const st = useSyncExternalStore(groupStore.subscribe, groupStore.read, () => EMPTY_STATE);
  const set = (f: (s: GroupState) => GroupState) => groupStore.write(f(groupStore.read()));
  const upd = (id: string, f: (g: Group) => Group) => set((s) => ({ ...s, groups: s.groups.map((g) => (g.id === id ? f(g) : g)) }));
  return {
    groups: st.groups,
    hidden: st.hidden,
    create: (name: string) => { const id = `g-${Date.now().toString(36)}`; set((s) => ({ ...s, groups: [...s.groups, { id, name, codes: [] }] })); return id; },
    rename: (id: string, name: string) => upd(id, (g) => ({ ...g, name })),
    remove: (id: string) => set((s) => (id.startsWith("b-") ? { ...s, hidden: [...s.hidden, id] } : { ...s, groups: s.groups.filter((g) => g.id !== id) })),
    restore: (id: string) => set((s) => ({ ...s, hidden: s.hidden.filter((x) => x !== id) })),
    setCodes: (id: string, codes: string[]) => upd(id, (g) => ({ ...g, codes })),
    add: (id: string, codes: string[]) => upd(id, (g) => ({ ...g, codes: [...g.codes, ...codes.filter((c) => !g.codes.includes(c))] })),
    toggle: (id: string, c: string) => upd(id, (g) => ({ ...g, codes: g.codes.includes(c) ? g.codes.filter((x) => x !== c) : [...g.codes, c] })),
  };
}

/** 「我的自選」群組（首頁、個股頁、選股器的加入自選都用這個） */
export function useWatchlist() {
  const g = useGroups();
  const my = g.groups.find((x) => x.id === "my") ?? g.groups[0];
  const list = my?.codes ?? [];
  return {
    list,
    has: (c: string) => g.groups.some((x) => x.codes.includes(c)),
    toggle: (c: string) => (list.includes(c) ? g.setCodes(my.id, list.filter((x) => x !== c)) : g.add(my.id, [c])),
    addMany: (cs: string[]) => g.add(my.id, cs),
    set: (cs: string[]) => g.setCodes(my.id, cs),
  };
}

// ---- 最近看過的股票 ----
const recentStore = localStore<string[]>("namba.recent", () => []);
const NONE: string[] = [];
export function useRecent() {
  const list = useSyncExternalStore(recentStore.subscribe, recentStore.read, () => NONE);
  return { list, push: (c: string) => recentStore.write([c, ...recentStore.read().filter((x) => x !== c)].slice(0, 8)) };
}

export { localStore };
