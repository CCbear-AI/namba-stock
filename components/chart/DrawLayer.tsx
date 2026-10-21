"use client";
// K 線畫線工具：畫在圖表上方的 SVG，座標用（時間, 價格）存，縮放平移時跟著圖走
import { useCallback, useEffect, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesType, Logical } from "lightweight-charts";
import type { Bar } from "@/lib/types";

export type Tool = "select" | "trend" | "hline" | "vline" | "ray" | "rect" | "fib" | "ruler" | "text" | "pattern";
type P = { t: number; p: number };
type Shape = { id: string; k: Exclude<Tool, "select" | "pattern">; a: P; b?: P; text?: string };

export const TOOLS: { k: Tool; title: string; icon: string }[] = [
  { k: "select", title: "選取／移動：點畫線選取，拖曳端點調整、拖曳線身移動", icon: "M5 3l12 8-6 1-3 6z" },
  { k: "trend", title: "趨勢線：點兩個點連成一條線", icon: "M4 17L17 4M4 17h0M17 4h0" },
  { k: "hline", title: "水平線：點一下，在那個價位畫一條橫線", icon: "M2 10h16M10 10h0" },
  { k: "vline", title: "垂直線：點一下，在那一天畫一條直線", icon: "M10 2v16" },
  { k: "ray", title: "射線：從第一點往第二點的方向一直延伸", icon: "M4 15L18 5M4 15h0" },
  { k: "rect", title: "矩形：點兩個對角框出一塊區域", icon: "M4 5h12v10H4z" },
  { k: "fib", title: "斐波那契回撤：點走勢的起點與終點，標出各回撤價位", icon: "M3 4h14M3 8h14M3 12h14M3 16h14" },
  { k: "ruler", title: "量尺：量兩點之間的價差、漲跌幅與相隔幾根", icon: "M3 14L14 3l3 3L6 17zM7 10l2 2M10 7l2 2" },
  { k: "text", title: "文字註記：點一下，在圖上寫字", icon: "M4 4h12M10 4v13" },
  { k: "pattern", title: "以圖找圖：在日 K 上框出一段走勢，到全市場找形狀相似的股票", icon: "M3 13l4-4 3 3 6-6M13 6h3v3" },
];
const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const COLOR = "#d9b45a";

type Props = {
  chart: IChartApi | null; series: ISeriesApi<SeriesType> | null; bars: Bar[]; storageKey: string;
  tool: Tool; setTool: (t: Tool) => void; magnet: boolean; hidden: boolean; locked: boolean;
  height: number; onCount: (n: number) => void; onPattern?: (from: number, to: number) => void;
  fmt: (v: number) => string;
};

function load(key: string): Shape[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}

export default function DrawLayer(p: Props) {
  const { chart, series, bars, storageKey, tool, setTool, magnet, hidden, locked, height, fmt } = p;
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [textAt, setTextAt] = useState<{ a: P; x: number; y: number } | null>(null);
  const [, setTick] = useState(0);
  const [drag, setDrag] = useState<{ id: string; part: "a" | "b" | "body"; start: P; orig: Shape } | null>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!box) return;
    const ro = new ResizeObserver(() => setW(box.clientWidth));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  // 換股票或週期就重新載入（依 props 推導 state）
  const [loaded, setLoaded] = useState<string | null>(null);
  if (loaded !== storageKey) { setLoaded(storageKey); setShapes(load(storageKey)); setSel(null); setDraft(null); }
  const save = useCallback((next: Shape[]) => {
    setShapes(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* 存不進去就算了 */ }
  }, [storageKey]);
  useEffect(() => { p.onCount(shapes.length); }, [shapes.length, p]);

  // 圖表縮放、平移、大小改變時重畫
  useEffect(() => {
    if (!chart) return;
    const f = () => setTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(f);
    chart.subscribeCrosshairMove(f);
    chart.timeScale().subscribeSizeChange(f);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(f);
      chart.unsubscribeCrosshairMove(f);
      chart.timeScale().unsubscribeSizeChange(f);
    };
  }, [chart]);

  // 座標換算
  const step = bars.length > 1 ? bars[bars.length - 1].time - bars[bars.length - 2].time : 86400;
  const idxOf = (t: number) => {
    if (!bars.length) return 0;
    const last = bars.length - 1;
    if (t >= bars[last].time) return last + (t - bars[last].time) / step;
    if (t <= bars[0].time) return (t - bars[0].time) / step;
    let lo = 0, hi = last;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (bars[m].time <= t) lo = m; else hi = m; }
    return lo + (t - bars[lo].time) / (bars[hi].time - bars[lo].time || 1);
  };
  const X = (t: number) => chart?.timeScale().logicalToCoordinate(idxOf(t) as Logical) ?? null;
  const Y = (v: number) => series?.priceToCoordinate(v) ?? null;
  const toP = (x: number, y: number): P | null => {
    if (!chart || !series || !bars.length) return null;
    const l = chart.timeScale().coordinateToLogical(x);
    const raw = series.coordinateToPrice(y);
    if (l == null || raw == null) return null;
    let v = Number(raw);
    const i = Math.round(l);
    const t = i >= 0 && i < bars.length ? bars[i].time : bars[bars.length - 1].time + (i - bars.length + 1) * step;
    if (magnet && i >= 0 && i < bars.length) {
      const b = bars[i];
      v = [b.open, b.high, b.low, b.close].reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), b.close);
    }
    return { t, p: v };
  };
  const local = (e: React.PointerEvent | PointerEvent) => {
    const r = box!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // 畫新的
  const onDown = (e: React.PointerEvent) => {
    if (tool === "select") return;
    const { x, y } = local(e);
    const pt = toP(x, y);
    if (!pt) return;
    if (tool === "hline" || tool === "vline") { save([...shapes, { id: crypto.randomUUID(), k: tool, a: pt }]); setTool("select"); return; }
    if (tool === "text") { setTextAt({ a: pt, x, y }); return; }
    if (!draft) { setDraft({ id: crypto.randomUUID(), k: tool === "pattern" ? "rect" : tool, a: pt, b: pt }); return; }
    // 第二點
    const done = { ...draft, b: pt };
    setDraft(null);
    if (tool === "pattern") {
      const [t1, t2] = [done.a.t, pt.t].sort((m, n) => m - n);
      p.onPattern?.(t1, t2);
    } else save([...shapes, done]);
    setTool("select");
  };
  const onMove = (e: React.PointerEvent) => {
    if (!draft) return;
    const { x, y } = local(e);
    const pt = toP(x, y);
    if (pt) setDraft({ ...draft, b: pt });
  };

  // 拖曳既有的
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag;
      if (!d) return;
      const { x, y } = local(e);
      const pt = toP(x, y);
      if (!pt) return;
      setShapes((list) => list.map((s) => {
        if (s.id !== d.id) return s;
        if (d.part === "a") return { ...s, a: pt };
        if (d.part === "b") return { ...s, b: pt };
        const dt = pt.t - d.start.t, dp = pt.p - d.start.p;
        return { ...s, a: { t: d.orig.a.t + dt, p: d.orig.a.p + dp }, b: d.orig.b && { t: d.orig.b.t + dt, p: d.orig.b.p + dp } };
      }));
    };
    const up = () => {
      if (!drag) return;
      setDrag(null);
      setShapes((list) => { try { localStorage.setItem(storageKey, JSON.stringify(list)); } catch { /* */ } return list; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  });
  const startDrag = (e: React.PointerEvent, s: Shape, part: "a" | "b" | "body") => {
    if (locked || tool !== "select") return;
    e.stopPropagation();
    setSel(s.id);
    const { x, y } = local(e);
    const pt = toP(x, y);
    if (pt) setDrag({ id: s.id, part, start: pt, orig: s });
  };

  // Esc 取消、Delete 刪除
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDraft(null); setTextAt(null); setTool("select"); setSel(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && sel && !textAt && !locked && !(e.target instanceof HTMLInputElement)) save(shapes.filter((s) => s.id !== sel));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [sel, shapes, save, setTool, textAt, locked]);

  const scaleW = chart?.priceScale("right").width() ?? 0;
  const plotW = Math.max(0, w - scaleW);

  const render = (s: Shape, preview = false) => {
    const xa = X(s.a.t), ya = Y(s.a.p);
    const xb = s.b ? X(s.b.t) : null, yb = s.b ? Y(s.b.p) : null;
    const on = sel === s.id;
    const stroke = on ? "#f0d08a" : COLOR;
    const hit = preview || locked || tool !== "select" ? "none" : "stroke";
    const handles = on && !locked && s.b && xa != null && ya != null && xb != null && yb != null && (
      <>
        <circle cx={xa} cy={ya} r={5} fill="#101215" stroke={stroke} style={{ pointerEvents: "all", cursor: "move" }} onPointerDown={(e) => startDrag(e, s, "a")} />
        <circle cx={xb} cy={yb} r={5} fill="#101215" stroke={stroke} style={{ pointerEvents: "all", cursor: "move" }} onPointerDown={(e) => startDrag(e, s, "b")} />
      </>
    );
    const common = { stroke, strokeWidth: on ? 2 : 1.5, style: { pointerEvents: hit, cursor: "move" } as React.CSSProperties, onPointerDown: (e: React.PointerEvent) => startDrag(e, s, "body") };
    switch (s.k) {
      case "hline":
        if (ya == null) return null;
        return <g key={s.id}><line x1={0} x2={plotW} y1={ya} y2={ya} {...common} /><text x={plotW - 4} y={ya - 4} textAnchor="end" fill={stroke} fontSize={11}>{fmt(s.a.p)}</text></g>;
      case "vline":
        if (xa == null) return null;
        return <line key={s.id} x1={xa} x2={xa} y1={0} y2={height} {...common} />;
      case "text":
        if (xa == null || ya == null) return null;
        return <text key={s.id} x={xa} y={ya} fill={stroke} fontSize={13} style={{ pointerEvents: hit === "none" ? "none" : "all", cursor: "move" }} onPointerDown={(e) => startDrag(e, s, "body")}>{s.text}</text>;
    }
    if (xa == null || ya == null || xb == null || yb == null) return null;
    switch (s.k) {
      case "trend":
        return <g key={s.id}><line x1={xa} y1={ya} x2={xb} y2={yb} {...common} />{handles}</g>;
      case "ray": {
        const dx = xb - xa, dy = yb - ya, k = dx === 0 ? 1e4 : Math.max(1, (plotW - xa) / dx);
        return <g key={s.id}><line x1={xa} y1={ya} x2={dx >= 0 ? xa + dx * k : xb} y2={dx >= 0 ? ya + dy * k : yb} {...common} />{handles}</g>;
      }
      case "rect":
        return <g key={s.id}><rect x={Math.min(xa, xb)} y={Math.min(ya, yb)} width={Math.abs(xb - xa)} height={Math.abs(yb - ya)} fill={preview && tool === "pattern" ? "#d9b45a22" : "#d9b45a14"} {...common} />{handles}</g>;
      case "fib":
        return (
          <g key={s.id}>
            {FIB.map((f) => {
              const v = s.b!.p + (s.a.p - s.b!.p) * f, y = Y(v);
              return y == null ? null : <g key={f}><line x1={Math.min(xa, xb)} x2={plotW} y1={y} y2={y} {...common} strokeDasharray={f === 0 || f === 1 ? undefined : "4 3"} /><text x={Math.min(xa, xb) + 2} y={y - 3} fill={stroke} fontSize={10.5}>{(f * 100).toFixed(1)}%　{fmt(v)}</text></g>;
            })}
            <line x1={xa} y1={ya} x2={xb} y2={yb} {...common} strokeDasharray="2 3" />
            {handles}
          </g>
        );
      case "ruler": {
        const d = s.b!.p - s.a.p, pct = (d / s.a.p) * 100, n = Math.round(idxOf(s.b!.t) - idxOf(s.a.t));
        const col = d >= 0 ? "#f0505a" : "#22b573";
        return (
          <g key={s.id}>
            <rect x={Math.min(xa, xb)} y={Math.min(ya, yb)} width={Math.abs(xb - xa)} height={Math.abs(yb - ya)} fill={col + "22"} stroke={col} strokeWidth={1} style={{ pointerEvents: hit === "none" ? "none" : "all", cursor: "move" }} onPointerDown={(e) => startDrag(e, s, "body")} />
            <text x={(xa + xb) / 2} y={Math.min(ya, yb) - 6} textAnchor="middle" fill={col} fontSize={12}>{d >= 0 ? "+" : ""}{fmt(d)}（{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%）· {Math.abs(n)} 根</text>
            {handles}
          </g>
        );
      }
    }
    return null;
  };

  const capture = tool !== "select";
  return (
    <div ref={setBox} className="absolute left-0 right-0 top-0 z-[5]" style={{ height, pointerEvents: capture ? "auto" : "none", cursor: capture ? "crosshair" : undefined }} onPointerDown={onDown} onPointerMove={onMove}>
      {!hidden && (
        <svg width="100%" height={height} className="absolute inset-0 overflow-visible" style={{ pointerEvents: "none" }}>
          {shapes.map((s) => render(s))}
          {draft && render(draft, true)}
        </svg>
      )}
      {draft && <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-[#101215]/95 border border-line px-3 py-1 text-[12px] pointer-events-none">{tool === "pattern" ? "點區間的終點" : "點第二個點完成"} · Esc 取消</div>}
      {sel && !locked && tool === "select" && (
        <button className="absolute right-16 top-2 btn !py-0.5 text-[12px]" style={{ pointerEvents: "auto" }} onClick={() => { save(shapes.filter((s) => s.id !== sel)); setSel(null); }}>刪除這條畫線</button>
      )}
      {textAt && (
        <input
          autoFocus
          className="absolute bg-panel-2 border border-[var(--gold)] rounded px-2 py-0.5 text-[13px] outline-none"
          style={{ left: textAt.x, top: textAt.y - 14, pointerEvents: "auto" }}
          placeholder="輸入文字後按 Enter"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = (e.target as HTMLInputElement).value.trim();
              if (v) save([...shapes, { id: crypto.randomUUID(), k: "text", a: textAt.a, text: v }]);
              setTextAt(null); setTool("select");
            }
          }}
          onBlur={() => { setTextAt(null); setTool("select"); }}
        />
      )}
    </div>
  );
}
