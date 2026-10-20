"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

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

// ---- 自選股（存在這台裝置的瀏覽器） ----
const KEY = "namba.watchlist";
const listeners = new Set<() => void>();
let cached: string[] | null = null;
function read(): string[] {
  if (cached) return cached;
  try { cached = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { cached = []; }
  return cached!;
}
const EMPTY: string[] = [];
export function useWatchlist() {
  const list = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => EMPTY,
  );
  const save = (next: string[]) => {
    cached = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 無痕模式寫不進去就算了 */ }
    listeners.forEach((f) => f());
  };
  return {
    list,
    has: (c: string) => list.includes(c),
    toggle: (c: string) => save(list.includes(c) ? list.filter((x) => x !== c) : [...list, c]),
    set: save,
  };
}
