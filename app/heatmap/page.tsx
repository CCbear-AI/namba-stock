"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useScan } from "@/components/hooks";
import { cls, pct, price } from "@/components/fmt";
import ExportBtn from "@/components/ExportBtn";
import Heatmap, { PERIODS, periodPct, heat, type Period } from "@/components/Heatmap";
import { industryGroup } from "@/lib/industries";
import Help from "@/components/Help";

export default function HeatmapPage() {
  const { data } = useScan();
  const [period, setPeriod] = useState<Period>("d");
  const [sizeBy, setSizeBy] = useState<"cap" | "value">("cap");
  const [group, setGroup] = useState<"全部" | "電子" | "金融" | "傳產">("全部");
  const rows = useMemo(() => (data?.rows ?? []).filter((s) => (s.vol > 0 || period !== "d") && (group === "全部" || industryGroup(s.ind) === group)), [data, group, period]);
  // 跟里長伯一樣：取總市值（或成交值）前 15 大的產業，再從裡面挑最大的 150 檔
  const IND = 15, TOP = 150;
  const shown = useMemo(() => {
    const by: Record<string, typeof rows> = {};
    for (const r of rows) (by[r.ind] ??= []).push(r);
    const sum = (l: typeof rows) => l.reduce((s, r) => s + r[sizeBy], 0);
    const inds = Object.values(by).sort((a, b) => sum(b) - sum(a)).slice(0, IND);
    return inds.flat().sort((a, b) => b[sizeBy] - a[sizeBy]).slice(0, TOP);
  }, [rows, sizeBy]);
  const indCount = useMemo(() => new Set(shown.map((r) => r.ind)).size, [shown]);
  const share = useMemo(() => {
    const all = rows.reduce((s, r) => s + r[sizeBy], 0);
    return all ? Math.round((shown.reduce((s, r) => s + r[sizeBy], 0) / all) * 100) : 0;
  }, [rows, shown, sizeBy]);
  const sectors = useMemo(() => {
    const g: Record<string, { cap: number; w: number }> = {};
    for (const r of rows) { const x = (g[r.ind] ??= { cap: 0, w: 0 }); x.cap += r.cap; x.w += r.cap * periodPct(r, period); }
    return Object.entries(g).map(([k, v]) => ({ k, pct: v.cap ? v.w / v.cap : 0 })).sort((a, b) => b.pct - a.pct);
  }, [rows, period]);
  const groupPct = useMemo(() => Object.fromEntries(sectors.map((x) => [x.k, x.pct])), [sectors]);
  const ranked = useMemo(() => [...rows].sort((a, b) => periodPct(b, period) - periodPct(a, period)), [rows, period]);
  const pl = PERIODS.find((x) => x.k === period)!.l;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">大盤熱力圖<Help>紅色上漲、綠色下跌，面積越大代表{sizeBy === "cap" ? "市值" : "成交值"}越大。顯示 {indCount} 個產業中{sizeBy === "cap" ? "市值" : "成交值"}最大的 {shown.length} 檔（佔全體個股{sizeBy === "cap" ? "市值" : "成交值"} {share}%）；產業標題是整個產業的市值加權漲跌幅。{period !== "d" && "近 N 日是對比 N 個交易日前收盤，未還原除權息。"}</Help></h1>
        <span className="sub">漲跌週期</span>
        <div className="seg">{PERIODS.map((p) => <button key={p.k} className={period === p.k ? "on" : ""} onClick={() => setPeriod(p.k)}>{p.l}</button>)}</div>
        <span className="sub">面積依據</span>
        <div className="seg"><button className={sizeBy === "cap" ? "on" : ""} onClick={() => setSizeBy("cap")}>市值</button><button className={sizeBy === "value" ? "on" : ""} onClick={() => setSizeBy("value")}>成交值</button></div>
        <div className="seg">{(["全部", "電子", "金融", "傳產"] as const).map((g) => <button key={g} className={group === g ? "on" : ""} onClick={() => setGroup(g)}>{g}</button>)}</div>
        <div className="flex-1" />
        <Legend cap={period === "d" ? 10 : period === 5 ? 15 : 35} />
        <ExportBtn name="大盤熱力圖" target={() => document.getElementById("heatmap-area")} />
      </div>
      <div id="heatmap-area" className="grid gap-4 xl:grid-cols-[1fr_260px]">
        <div className="card p-2 overflow-hidden">
          <Heatmap rows={shown} period={period} sizeBy={sizeBy} perGroup={TOP} groupPct={groupPct} ratio={0.72} maxH={1100} minH={480} />
        </div>
        {/* 寬螢幕在熱力圖右邊直排；不夠寬掉到下面時三張並排，不要每張都拉滿整列 */}
        <div className="grid gap-4 content-start items-start md:grid-cols-[1.3fr_1fr_1fr] xl:grid-cols-1">
          <div className="card">
            <div className="card-h">類股漲跌排行 <span className="sub">{pl}</span></div>
            <div className="scroll-y max-h-[164px] xl:max-h-[320px] px-4 pb-3 text-[13px]">
              {sectors.map((s) => (
                <div key={s.k} className="flex items-center gap-2 py-[3px]">
                  <span className="w-[5.5em] shrink-0 truncate">{s.k}</span>
                  <div className="flex-1 h-2 bg-panel-2 rounded overflow-hidden"><div style={{ width: `${Math.min(100, Math.abs(s.pct) * (period === "d" ? 20 : 4))}%`, height: "100%", background: s.pct >= 0 ? "var(--up)" : "var(--down)" }} /></div>
                  <span className={`mono w-[4.2em] shrink-0 text-right ${cls(s.pct)}`}>{pct(s.pct)}</span>
                </div>
              ))}
            </div>
          </div>
          {[{ t: "漲幅前 5 檔", l: ranked.slice(0, 5) }, { t: "跌幅前 5 檔", l: ranked.slice(-5).reverse() }].map((x) => (
            <div key={x.t} className="card">
              <div className="card-h">{x.t} <span className="sub">{pl}</span></div>
              <div className="px-2 pb-2">
                {x.l.map((r) => (
                  <Link key={r.c} href={`/stock/${r.c}`} className="flex items-baseline gap-2 px-2 py-1.5 rounded-lg hover:bg-panel-2 text-[13px]">
                    <span className="mono text-text-2 w-[3.6em] shrink-0">{r.c}</span>
                    <span className="flex-1 min-w-0 truncate">{r.n}</span>
                    <span className="mono text-text-2">{price(r.vol > 0 ? r.price : r.prev)}</span>
                    <span className={`mono w-[4.6em] shrink-0 text-right ${cls(periodPct(r, period))}`}>{pct(periodPct(r, period))}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 顏色圖例：-N% 綠 … +N% 紅 */
function Legend({ cap }: { cap: number }) {
  const steps = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1];
  return (
    <span className="flex items-center gap-1.5 mono text-[11px] text-text-2" aria-label={`顏色：-${cap}% 到 +${cap}%`}>
      -{cap}%
      <span className="flex h-2.5 w-28 overflow-hidden rounded">{steps.map((t) => <i key={t} className="flex-1" style={{ background: heat(t * cap, cap) }} />)}</span>
      +{cap}%
    </span>
  );
}
