"use client";
// 熱力圖：依產業分區（或不分區），面積用市值／成交值／等大，顏色是漲跌幅
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cls, pct, price } from "./fmt";
import { squarify } from "@/lib/treemap";
import type { ScanRow } from "@/lib/scan";

export type Period = "d" | 5 | 20 | 60;
export type SizeBy = "cap" | "value" | "equal";
export const PERIODS: { k: Period; l: string }[] = [{ k: "d", l: "當日" }, { k: 5, l: "近 5 日" }, { k: 20, l: "近 20 日" }, { k: 60, l: "近 60 日" }];
export const periodPct = (r: ScanRow, p: Period) => (p === "d" ? r.pct : p === 5 ? r.d5 : p === 20 ? r.d20 : r.d60);

/** 漲跌幅 → 顏色（台股：紅漲綠跌）；cap 是顏色封頂的漲跌幅 */
export function heat(p: number, cap = 7) {
  const t = Math.min(1, Math.abs(p) / cap);
  if (Math.abs(p) < 0.05) return "#2b2f36";
  return p > 0 ? `rgb(${Math.round(70 + 170 * t)},${Math.round(40 - 10 * t)},${Math.round(48 - 8 * t)})` : `rgb(20,${Math.round(70 + 110 * t)},${Math.round(55 + 40 * t)})`;
}

/** 方格內文字：名稱依格子寬高自動縮放；窄長格子改直排；都放不下就顯示代號（數字比中文窄） */
function cellText(n: string, c: string, w: number, h: number) {
  const MIN = 8;
  const horiz = (chars: number, k = 1) => Math.min(22, (w - 4) / (chars * k), h * 0.7);
  const vert = Math.min(22, (h - 4) / n.length, w * 0.75);
  let label = n, fs = horiz(n.length), vertical = false;
  if (fs < MIN && vert >= MIN && h > w) { fs = vert; vertical = true; }
  else if (fs < MIN) { label = c; fs = horiz(c.length, 0.6); if (fs < MIN) label = ""; }
  if (!vertical) fs = Math.min(fs, Math.max(MIN, h * 0.42));
  // 漲跌幅（約 6 個半形字）要有第二行的高度才放
  const fp = Math.min(18, fs * 0.82, (w - 4) / 3.6);
  return { label, fs, vertical, fp: label && !vertical && h >= fs * 1.25 + fp * 1.2 + 2 && fp >= 7.5 ? fp : 0 };
}

export default function Heatmap({ rows, period = "d", sizeBy = "cap", byIndustry = true, perGroup = 40, minH = 420, ratio = 0.62, maxH = 760, groupPct }: {
  rows: ScanRow[]; period?: Period; sizeBy?: SizeBy; byIndustry?: boolean; perGroup?: number; minH?: number;
  /** 高度＝寬度×ratio，限制在 minH~maxH */
  ratio?: number; maxH?: number;
  /** 產業標題的漲跌幅（整個產業市值加權）；沒給就用畫出來的這些股票算 */
  groupPct?: Record<string, number>;
}) {
  const [hover, setHover] = useState<ScanRow | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(1000);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = Math.max(minH, Math.min(maxH, Math.round(W * ratio)));
  const cap = period === "d" ? 7 : period === 5 ? 15 : 35;
  const size = (r: ScanRow) => (sizeBy === "equal" ? 1 : Math.max(0.01, r[sizeBy]));

  const { sectors, cells } = useMemo(() => {
    const live = rows.filter((s) => s.vol > 0 || period !== "d");
    if (!byIndustry) {
      return { sectors: [], cells: squarify([...live].sort((a, b) => size(b) - size(a)).map((s) => ({ v: size(s), d: s })), { x: 0, y: 0, w: W, h: H }) };
    }
    const by: Record<string, ScanRow[]> = {};
    for (const r of live) (by[r.ind] ??= []).push(r);
    const sec = Object.entries(by).map(([k, list]) => {
      // 每個產業只畫前幾大，其他太小看不到
      const top = [...list].sort((a, b) => size(b) - size(a)).slice(0, perGroup);
      const cp = list.reduce((s, r) => s + r.cap, 0);
      return { k, top, v: top.reduce((s, r) => s + size(r), 0), pct: groupPct?.[k] ?? (cp ? list.reduce((s, r) => s + r.cap * periodPct(r, period), 0) / cp : 0) };
    });
    const rects = squarify(sec.map((s) => ({ v: s.v, d: s })), { x: 0, y: 0, w: W, h: H });
    const cells = rects.flatMap((r) => squarify(r.d.top.map((s) => ({ v: size(s), d: s })), { x: r.x + 1, y: r.y + 18, w: r.w - 2, h: r.h - 19 }));
    return { sectors: rects, cells };
  }, [rows, sizeBy, byIndustry, perGroup, W, H, period, groupPct]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={box} className="relative w-full" style={{ height: H }} onMouseLeave={() => setHover(null)}>
      {sectors.map((s) => (
        <div key={s.d.k} className="absolute border border-[#0b0c0e] text-[11px] px-1 truncate text-text-2" style={{ left: s.x, top: s.y, width: s.w, height: s.h }}>
          {s.w > 50 && <>{s.d.k} <span className={cls(s.d.pct)}>{pct(s.d.pct)}</span></>}
        </div>
      ))}
      {cells.map((c) => {
        const p = periodPct(c.d, period);
        const t = cellText(c.d.n, c.d.c, c.w, c.h);
        return (
          <Link key={c.d.c} href={`/stock/${c.d.c}`} onMouseEnter={() => setHover(c.d)} title={`${c.d.c} ${c.d.n} ${pct(p)}`}
            className="absolute flex flex-col items-center justify-center overflow-hidden text-white border border-[#0b0c0e] hover:brightness-125"
            style={{ left: c.x, top: c.y, width: c.w, height: c.h, background: heat(p, cap) }}>
            {t.label && <span style={{ fontSize: t.fs, writingMode: t.vertical ? "vertical-rl" : undefined }} className={`font-semibold leading-tight whitespace-nowrap ${t.label === c.d.c ? "mono" : ""}`}>{t.label}</span>}
            {t.fp > 0 && <span style={{ fontSize: t.fp }} className="mono leading-tight opacity-90 whitespace-nowrap">{pct(p)}</span>}
          </Link>
        );
      })}
      {!cells.length && <div className="absolute inset-0 flex items-center justify-center loading">熱力圖載入中…</div>}
      {hover && (
        <div className="absolute right-2 top-2 card px-3 py-2 text-[13px] pointer-events-none">
          <div><span className="mono text-text-2">{hover.c}</span> <b>{hover.n}</b> <span className="sub">{hover.ind}</span></div>
          <div className="mono"><span className={cls(hover.chg)}>{price(hover.price)} {pct(hover.pct)}</span> · 成交 {hover.value.toFixed(1)} 億 · 市值 {hover.cap.toLocaleString()} 億</div>
          {period !== "d" && <div className="mono sub">{PERIODS.find((x) => x.k === period)!.l} <span className={cls(periodPct(hover, period))}>{pct(periodPct(hover, period))}</span></div>}
        </div>
      )}
    </div>
  );
}
