"use client";
// 迷你走勢圖：當日分時或近 N 日收盤折線（多股看盤、漲幅排行速覽用）
import { useEffect, useMemo, useRef } from "react";
import { createChart, AreaSeries, LineStyle, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { usePoll } from "./hooks";
import type { Bar } from "@/lib/types";

export type Span = "day" | 20 | 60 | 180;

export default function MiniChart({ code, span = "day", prev, height = 240, onRange }: { code: string; span?: Span; prev?: number; height?: number; onRange?: (pct: number, code: string, span: Span) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const day = span === "day";
  const { data } = usePoll<{ bars: Bar[] }>(`/api/candles?code=${encodeURIComponent(code)}&tf=${day ? "1m" : "1d"}`, day ? 30_000 : 120_000);
  const bars = useMemo(() => {
    const b = data?.bars ?? [];
    return day ? b.map((x) => ({ ...x, time: x.time + 8 * 3600 })) : b.slice(-(span as number) - 1);
  }, [data, day, span]);
  const base = day ? prev ?? bars[0]?.open : bars[0]?.close;

  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      height, autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#9aa0a8", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: "#1b1e23" } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: day, secondsVisible: false },
      handleScroll: false, handleScale: false,
    });
    chart.current = c;
    return () => { c.remove(); chart.current = null; };
  }, [height, day]);

  useEffect(() => {
    const c = chart.current;
    if (!c || !bars.length || base == null) return;
    for (const s of c.panes()[0]?.getSeries() ?? []) c.removeSeries(s);
    const last = bars[bars.length - 1].close;
    const col = last >= base ? "#f0505a" : "#22b573";
    const s = c.addSeries(AreaSeries, { lineColor: col, topColor: col + "33", bottomColor: col + "02", lineWidth: 2, priceLineVisible: false, lineType: day ? 0 : 2 });
    s.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.close })));
    s.createPriceLine({ price: base, color: "#646a73", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: day ? "昨收" : "區間起點" });
    c.timeScale().fitContent();
    onRange?.(base ? ((last - base) / base) * 100 : 0, code, span);
  }, [bars, base, day, onRange, code, span]);

  return (
    <div className="relative">
      <div ref={box} style={{ height }} className="w-full" />
      {!bars.length && <div className="absolute inset-0 flex items-center justify-center sub loading">載入中…</div>}
    </div>
  );
}
