"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePoll } from "@/components/hooks";
import { cls, pct, price } from "@/components/fmt";
import { squarify } from "@/lib/treemap";
import { industryGroup } from "@/lib/industries";
import type { Market, Row } from "@/lib/types";

/** 漲跌幅 → 顏色（台股：紅漲綠跌） */
function heat(p: number) {
  const t = Math.min(1, Math.abs(p) / 7);
  if (Math.abs(p) < 0.05) return "#2b2f36";
  return p > 0 ? `rgb(${Math.round(70 + 170 * t)},${Math.round(40 - 10 * t)},${Math.round(48 - 8 * t)})` : `rgb(${Math.round(20)},${Math.round(70 + 110 * t)},${Math.round(55 + 40 * t)})`;
}

export default function Heatmap() {
  const { data: m } = usePoll<Market>("/api/market", 20_000);
  const [sizeBy, setSizeBy] = useState<"cap" | "value">("cap");
  const [group, setGroup] = useState<"全部" | "電子" | "金融" | "傳產">("全部");
  const [hover, setHover] = useState<Row | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(1000);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = Math.max(420, Math.min(760, Math.round(W * 0.62)));

  const { sectors, cells } = useMemo(() => {
    const rows = (m?.stocks ?? []).filter((s) => s.vol > 0 && (group === "全部" || industryGroup(s.ind) === group));
    const by: Record<string, Row[]> = {};
    for (const r of rows) (by[r.ind] ??= []).push(r);
    const sec = Object.entries(by).map(([k, list]) => {
      // 每個產業只畫前 40 大，其他太小看不到
      const top = [...list].sort((a, b) => b[sizeBy] - a[sizeBy]).slice(0, 40);
      const v = top.reduce((s, r) => s + r[sizeBy], 0);
      const cap = list.reduce((s, r) => s + r.cap, 0);
      return { k, top, v, pct: cap ? list.reduce((s, r) => s + r.cap * r.pct, 0) / cap : 0 };
    });
    const rects = squarify(sec.map((s) => ({ v: s.v, d: s })), { x: 0, y: 0, w: W, h: H });
    const cells = rects.flatMap((r) => {
      const inner = { x: r.x + 1, y: r.y + 18, w: r.w - 2, h: r.h - 19 };
      return squarify(r.d.top.map((s) => ({ v: s[sizeBy], d: s })), inner);
    });
    return { sectors: rects, cells };
  }, [m, sizeBy, group, W, H]);

  const sideRank = useMemo(() => sectors.map((s) => s.d).sort((a, b) => b.pct - a.pct), [sectors]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">大盤熱力圖</h1>
        <div className="seg">{(["全部", "電子", "金融", "傳產"] as const).map((g) => <button key={g} className={group === g ? "on" : ""} onClick={() => setGroup(g)}>{g}</button>)}</div>
        <span className="sub">面積依據</span>
        <div className="seg"><button className={sizeBy === "cap" ? "on" : ""} onClick={() => setSizeBy("cap")}>市值</button><button className={sizeBy === "value" ? "on" : ""} onClick={() => setSizeBy("value")}>成交值</button></div>
        <span className="sub ml-auto">紅漲綠跌，顏色越深漲跌越大（±7% 封頂）</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
        <div className="card p-2 overflow-hidden">
          <div ref={box} className="relative w-full" style={{ height: H }} onMouseLeave={() => setHover(null)}>
            {sectors.map((s) => (
              <div key={s.d.k} className="absolute border border-[#0b0c0e] text-[11px] px-1 truncate text-text-2" style={{ left: s.x, top: s.y, width: s.w, height: s.h }}>
                {s.w > 50 && <>{s.d.k} <span className={cls(s.d.pct)}>{pct(s.d.pct)}</span></>}
              </div>
            ))}
            {cells.map((c) => {
              const big = c.w > 70 && c.h > 40;
              return (
                <Link
                  key={c.d.c} href={`/stock/${c.d.c}`}
                  onMouseEnter={() => setHover(c.d)}
                  className="absolute flex flex-col items-center justify-center overflow-hidden text-white border border-[#0b0c0e] hover:brightness-125"
                  style={{ left: c.x, top: c.y, width: c.w, height: c.h, background: heat(c.d.pct) }}
                >
                  {c.w > 34 && c.h > 18 && <span style={{ fontSize: big ? Math.min(22, c.w / 6) : 11 }} className="font-semibold leading-tight truncate max-w-full px-0.5">{c.d.n}</span>}
                  {c.w > 40 && c.h > 32 && <span style={{ fontSize: big ? Math.min(18, c.w / 8) : 10 }} className="mono leading-tight opacity-90">{pct(c.d.pct)}</span>}
                </Link>
              );
            })}
            {!cells.length && <div className="absolute inset-0 flex items-center justify-center loading">熱力圖載入中…</div>}
            {hover && (
              <div className="absolute right-2 top-2 card px-3 py-2 text-[13px] pointer-events-none">
                <div><span className="mono text-text-2">{hover.c}</span> <b>{hover.n}</b> <span className="sub">{hover.ind}</span></div>
                <div className="mono"><span className={cls(hover.chg)}>{price(hover.price)} {pct(hover.pct)}</span> · 成交 {hover.value.toFixed(1)} 億 · 市值 {hover.cap.toLocaleString()} 億</div>
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-h">類股漲跌排行</div>
          <div className="scroll-y max-h-[700px] px-4 pb-3">
            {sideRank.map((s) => (
              <div key={s.k} className="flex items-center gap-2 py-1">
                <span className="w-20 truncate">{s.k}</span>
                <div className="flex-1 h-2 bg-panel-2 rounded overflow-hidden"><div style={{ width: `${Math.min(100, Math.abs(s.pct) * 20)}%`, height: "100%", background: s.pct >= 0 ? "var(--up)" : "var(--down)" }} /></div>
                <span className={`mono w-16 text-right ${cls(s.pct)}`}>{pct(s.pct)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
