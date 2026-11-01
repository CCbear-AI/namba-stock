"use client";
// 指標的方框與線段（SMC 訂單塊、FVG、BOS/CHoCH、支撐壓力線…）：用 SVG 疊在主圖上，
// 每一格畫面依時間軸／價格軸換算座標，拖曳縮放都會跟著動
import { useEffect, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesType, Logical } from "lightweight-charts";
import type { Shape } from "@/lib/indicators";

type Px = { k: "box" | "seg"; x1: number; x2: number; y1: number; y2: number; s: Shape };

export default function ShapeLayer({ chart, series, shapes, height }: { chart: IChartApi | null; series: ISeriesApi<SeriesType> | null; shapes: Shape[]; height: number }) {
  const [px, setPx] = useState<{ w: number; list: Px[] } | null>(null);

  useEffect(() => {
    if (!chart || !series || !shapes.length) return;
    let raf = 0, prev = "";
    const tick = () => {
      const ts = chart.timeScale(), w = Math.round(ts.width());
      const x = (i: number | null) => (i == null ? w : ts.logicalToCoordinate(i as Logical));
      const y = (p: number) => series.priceToCoordinate(p);
      const list: Px[] = [];
      for (const s of shapes) {
        const x1 = x(s.i1), x2 = x(s.i2);
        if (x1 == null || x2 == null || x2 < 0 || x1 > w) continue;
        const y1 = y(s.k === "box" ? s.top : s.p1), y2 = y(s.k === "box" ? s.bot : s.p2);
        if (y1 == null || y2 == null) continue;
        list.push({ k: s.k, x1: Math.round(x1), x2: Math.round(x2), y1: Math.round(y1), y2: Math.round(y2), s });
      }
      const key = w + ":" + list.map((p) => `${p.x1},${p.x2},${p.y1},${p.y2}`).join("|");
      if (key !== prev) { prev = key; setPx({ w, list }); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chart, series, shapes]);

  if (!px || !px.list.length || !shapes.length) return null;
  const txt = { stroke: "#0b0d11", strokeWidth: 3, paintOrder: "stroke" as const };
  return (
    <svg className="absolute left-0 top-0 z-[4] pointer-events-none" width={px.w} height={height} style={{ overflow: "hidden" }} aria-hidden="true">
      {px.list.map((p, k) => {
        const s = p.s;
        if (s.k === "box") {
          const top = Math.min(p.y1, p.y2), h = Math.max(1, Math.abs(p.y2 - p.y1)), wd = Math.max(1, p.x2 - p.x1);
          return (
            <g key={k}>
              <rect x={p.x1} y={top} width={wd} height={h} fill={s.color} fillOpacity={s.alpha ?? 0.16} stroke={s.color} strokeOpacity={0.45} strokeWidth={1} />
              {s.text && <text x={Math.max(p.x1, 0) + 4} y={h >= 12 ? top + 11 : top - 2} fill={s.color} fontSize={10} {...txt}>{s.text}</text>}
            </g>
          );
        }
        const mid = (p.x1 + p.x2) / 2, ty = s.below ? Math.max(p.y1, p.y2) + 11 : Math.min(p.y1, p.y2) - 3;
        return (
          <g key={k}>
            <line x1={p.x1} x2={p.x2} y1={p.y1} y2={p.y2} stroke={s.color} strokeWidth={s.width ?? 1} strokeDasharray={s.dash ? "4 3" : undefined} />
            {s.text && <text x={s.textAt === "end" ? p.x2 - 4 : mid} y={ty} fill={s.color} fontSize={s.small ? 9 : 10.5} textAnchor={s.textAt === "end" ? "end" : "middle"} {...txt}>{s.text}</text>}
          </g>
        );
      })}
    </svg>
  );
}
