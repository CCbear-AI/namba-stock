"use client";
// 列表裡看得到的股票才抓小走勢：當日分時（/api/spark）或近 N 日收盤（/api/closes）
import { useEffect, useState } from "react";

export function useSparks(codes: string[], mode: "day" | number) {
  const [data, setData] = useState<Record<string, number[]>>({});
  const key = codes.join(",");
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const run = async () => {
      const url = mode === "day" ? `/api/spark?codes=${key}` : `/api/closes?codes=${key}&n=${mode}`;
      try { const j = await (await fetch(url)).json(); if (!stop) setData((d) => ({ ...d, ...j })); } catch { /* 下次再抓 */ }
    };
    run();
    const t = mode === "day" ? setInterval(run, 60_000) : undefined;
    return () => { stop = true; clearInterval(t); };
  }, [key, mode]);
  return data;
}
