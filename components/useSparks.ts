"use client";
// 列表裡看得到的股票才抓小走勢：當日分時（/api/spark）或近 N 日收盤（/api/closes）
import { useEffect, useState } from "react";
import { startPolling } from "./pollPace";

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
    if (mode !== "day") { run(); return () => { stop = true; }; }
    const end = startPolling(run, 60_000); // 分頁看不到就暫停、收盤後放慢
    return () => { stop = true; end(); };
  }, [key, mode]);
  return data;
}
