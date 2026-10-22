"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePoll } from "@/components/hooks";
import { cls, pct, price, num } from "@/components/fmt";
import ExportBtn from "@/components/ExportBtn";
import Distribution from "@/components/Distribution";
import { isLimitUp, isLimitDown, lockedUp, openedUp, openedDown } from "@/lib/conditions";
import type { ScanRow } from "@/lib/scan";
import Help from "@/components/Help";

type Scan = { time: number; open: boolean; rows: ScanRow[] };
type Ev = { limits: Record<string, { up?: string; upOpen?: number; dn?: string; dnOpen?: number }>; today?: boolean };
type Tab = "up" | "dn" | "upOpen" | "dnOpen";
const TAB_L: Record<Tab, string> = { up: "漲停", dn: "跌停", upOpen: "漲停打開", dnOpen: "跌停打開" };
/** 昨天是不是漲停（用近 20 日收盤推算） */
const ydayLimit = (r: ScanRow, dir: 1 | -1) => { const c = r.c20; if (c.length < 3) return false; const p = c[c.length - 2] / c[c.length - 3] - 1; return dir > 0 ? p >= 0.094 : p <= -0.094; };

export default function Limits() {
  const { data } = usePoll<Scan>("/api/scan", 40_000);
  const { data: ev } = usePoll<Ev>("/api/events", 40_000);
  const [tab, setTab] = useState<Tab>("up");
  const [ind, setInd] = useState<string | null>(null);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.vol > 0), [data]);
  const lim = ev?.today ? ev.limits : {};
  const ups = rows.filter(isLimitUp), dns = rows.filter(isLimitDown), upOpen = rows.filter(openedUp), dnOpen = rows.filter(openedDown);
  const lockedN = ups.filter(lockedUp).length;
  const sealRate = ups.length + upOpen.length ? (ups.length / (ups.length + upOpen.length)) * 100 : 0;
  // 開盤即漲停／跌停：開盤價就在漲跌停價（之後打開也算，跟里長伯一致）
  const openLimit = rows.filter((r) => r.up > 0 && r.open >= r.up).length;
  const openLimitDn = rows.filter((r) => r.down > 0 && r.open <= r.down).length;
  const yUp = rows.filter((r) => ydayLimit(r, 1)).length, yDn = rows.filter((r) => ydayLimit(r, -1)).length;
  const best = [...ups].sort((a, b) => b.limStreak - a.limStreak)[0];
  const indCount: Record<string, number> = {};
  for (const r of ups) indCount[r.ind] = (indCount[r.ind] ?? 0) + 1;
  const byInd = Object.entries(indCount).sort((a, b) => b[1] - a[1]);
  const list = ({ up: ups, dn: dns, upOpen, dnOpen }[tab]).filter((r) => !ind || r.ind === ind)
    .sort((a, b) => (tab === "up" ? b.lockBid - a.lockBid : tab === "dn" ? b.av - a.av : b.vol - a.vol));
  const status = (r: ScanRow) => {
    if (tab === "upOpen" || tab === "dnOpen") return `打開${lim[r.c]?.[tab === "upOpen" ? "upOpen" : "dnOpen"] ? ` ${lim[r.c]![tab === "upOpen" ? "upOpen" : "dnOpen"]} 次` : ""}`;
    if (tab === "up" && r.limStreak >= 2) return `連 ${r.limStreak} 日`;
    if (tab === "up" && r.open >= r.up && r.low >= r.up) return "開盤即漲停";
    if (tab === "up") return lockedUp(r) ? "鎖住" : "成交在漲停";
    return r.bid1 ? "成交在跌停" : "鎖住";
  };

  return (
    <div className="grid gap-4" id="limits-area">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold">漲跌停監控</h1><span className="sub">漲跌幅限制 ±10% · {data?.open ? "盤中每 40 秒更新" : "已收盤"}</span>
        <span className="ml-auto"><ExportBtn name="漲跌停監控" target={() => document.getElementById("limits-area")} /></span>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card l="漲停家數" v={ups.length} c="up" s={`較昨日 ${ups.length - yUp >= 0 ? "+" : ""}${ups.length - yUp} · 開盤即漲停 ${openLimit} 檔`} />
        <Card l="跌停家數" v={dns.length} c="down" s={`較昨日 ${dns.length - yDn >= 0 ? "+" : ""}${dns.length - yDn} · 開盤即跌停 ${openLimitDn} 檔`} />
        <Card l="漲停打開" v={upOpen.length} c="text-[var(--gold-2)]" s="曾觸及漲停後回落" />
        <div className="card px-4 py-3"><div className="sub">封板率</div><div className="mono text-3xl font-semibold mt-1">{sealRate.toFixed(1)}%</div>
          <div className="h-1.5 bg-panel-2 rounded mt-2"><div className="h-full bg-[var(--up)] rounded" style={{ width: `${sealRate}%` }} /></div><div className="sub mt-1">鎖住 {lockedN} 檔</div></div>
        <Card l="最高連續漲停" v={best ? `${best.limStreak} 天` : "—"} c="up" s={best ? `${best.c} ${best.n} · ${best.ind}` : ""} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card"><div className="card-h">漲跌幅分布 <span className="sub">上市櫃個股 {rows.length.toLocaleString()} 檔</span></div><div className="px-4 pb-4"><Distribution rows={rows} /></div></div>
        <div className="card">
          <div className="card-h">漲停族群分布 <span className="sub">點族群篩選個股表格</span></div>
          <div className="scroll-y max-h-[220px] px-4 pb-4">
            {byInd.map(([k, v]) => (
              <button key={k} onClick={() => setInd(ind === k ? null : k)} className={`w-full flex items-center gap-3 py-1 rounded ${ind === k ? "text-[var(--gold-2)]" : ""}`}>
                <span className="w-24 text-left truncate">{k}</span>
                <div className="flex-1 h-2 bg-panel-2 rounded"><div className="h-full bg-[var(--up)] rounded" style={{ width: `${(v / byInd[0][1]) * 100}%` }} /></div>
                <span className="mono w-12 text-right">{v} 檔</span>
              </button>
            ))}
            {!byInd.length && <div className="sub py-6 text-center">今天還沒有漲停股</div>}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-h">
          <div className="seg">{(Object.keys(TAB_L) as Tab[]).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{TAB_L[t]} {({ up: ups, dn: dns, upOpen, dnOpen }[t]).length}</button>)}</div>
          <span className="sub">{ind && <button className="chip mr-2" onClick={() => setInd(null)}>{ind} ✕</button>}{tab === "up" ? "依漲停委買張數排序 · 由大到小" : tab === "dn" ? "依跌停委賣張數排序" : "依成交量排序"}<Help align="right">首次漲停時間與打開次數來自盤中資金流記錄器（每 30 秒比對一次）。</Help></span>
        </div>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="tbl">
            <thead><tr><th>股票</th><th className="!text-left">族群</th><th>成交價</th><th>漲跌幅</th><th>首次{tab.startsWith("dn") ? "跌停" : "漲停"}時間</th><th>連續天數</th><th>{tab.startsWith("dn") ? "跌停委賣" : "漲停委買"} (張)</th><th>成交量 (張)</th><th>狀態</th></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.c}>
                <td><Link href={`/stock/${r.c}`} className="hover:text-[var(--gold-2)]"><span className="mono text-text-2 mr-2">{r.c}</span>{r.n}</Link></td>
                <td className="!text-left text-text-2">{r.ind}</td>
                <td className={`mono ${cls(r.chg)}`}>{price(r.price)}</td>
                <td className={`mono ${cls(r.pct)}`}>{pct(r.pct)}</td>
                <td className="mono">{lim[r.c]?.[tab.startsWith("dn") ? "dn" : "up"] ?? "—"}</td>
                <td className="mono">{tab === "up" ? (r.limStreak >= 2 ? `${r.limStreak} 日` : "首日") : "—"}</td>
                <td className="mono">{tab === "up" ? num(r.lockBid) : tab === "dn" ? (r.bid1 ? "—" : num(r.av)) : "—"}</td>
                <td className="mono">{num(r.vol)}</td>
                <td><span className={`chip ${tab === "up" && r.limStreak >= 2 ? "!bg-[#3a1518] !text-[var(--up)]" : ""}`}>{status(r)}</span></td>
              </tr>
            ))}</tbody>
          </table>
          {!list.length && <div className="sub text-center py-8">{data ? "目前沒有" : "載入中…"}</div>}
        </div>
      </div>
    </div>
  );
}

function Card({ l, v, c, s }: { l: string; v: number | string; c: string; s: string }) {
  return <div className="card px-4 py-3"><div className="sub">{l}</div><div className={`mono text-3xl font-semibold mt-1 ${c}`}>{v}</div><div className="sub mt-1 truncate">{s}</div></div>;
}
