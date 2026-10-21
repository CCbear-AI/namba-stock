"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import KChart from "@/components/KChart";
import Spark from "@/components/Spark";
import StockPicker from "@/components/StockPicker";
import { usePoll, useScan, useWatchlist } from "@/components/hooks";
import { useSparks } from "@/components/useSparks";
import { cls, pct, price, num } from "@/components/fmt";
import { signalTags } from "@/lib/conditions";
import type { Market } from "@/lib/types";
import type { ScanRow } from "@/lib/scan";
import type { FlowEvent } from "@/lib/flow";

type Chips = { date: string; market: { total: number }; rank: { f: { buy: { c: string; n: string; lots: number }[] } } };
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function Home() {
  const router = useRouter();
  const { data: m } = usePoll<Market>("/api/market?lite=1", 20_000);
  const { data: scan } = useScan();
  const { data: ch } = usePoll<Chips>("/api/chips");
  const { data: ev } = usePoll<{ events: FlowEvent[]; today: boolean }>("/api/events", 30_000);
  const wl = useWatchlist();
  const [idx, setIdx] = useState<"t00" | "o00">("t00");
  const [adding, setAdding] = useState(false);
  const stocks = useMemo(() => (scan?.rows ?? []).filter((s) => s.vol > 0), [scan]);
  const by = (f: (a: ScanRow, b: ScanRow) => number, n = 30) => [...stocks].sort(f).slice(0, n);
  const gainers = by((a, b) => b.pct - a.pct || b.value - a.value);
  const losers = by((a, b) => a.pct - b.pct);
  const value = by((a, b) => b.value - a.value);
  const q = m?.indices.find((x) => x.c === idx);
  const b = m?.breadth;
  const signals = useMemo(() => stocks
    .map((s) => ({ s, tags: signalTags(s) }))
    .filter((x) => x.tags.length >= 2 && x.s.pct > 0)
    .sort((a, z) => z.s.pct - a.s.pct || z.s.rvol - a.s.rvol)
    .slice(0, 30), [stocks]);
  const byCode = useMemo(() => new Map((scan?.rows ?? []).map((r) => [r.c, r])), [scan]);
  // 自選股裡不在掃描清單的（ETF 等）另外查報價
  const missing = scan ? wl.list.filter((c) => !byCode.has(c)) : [];
  const { data: extra } = usePoll<Record<string, { c: string; n: string; price: number; prev: number; chg: number; pct: number }>>(missing.length ? `/api/quotes?codes=${missing.join(",")}` : null, 20_000);
  const watch = wl.list.map((c) => byCode.get(c) ?? (extra?.[c] as ScanRow | undefined)).filter(Boolean) as ScanRow[];
  const sparks = useSparks(watch.slice(0, 40).map((r) => r.c), "day");

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        <div className="card overflow-hidden">
          <div className="px-4 pt-4 flex items-baseline gap-3 flex-wrap">
            <div className="seg"><button className={idx === "t00" ? "on" : ""} onClick={() => setIdx("t00")}>加權指數</button><button className={idx === "o00" ? "on" : ""} onClick={() => setIdx("o00")}>櫃買指數</button></div>
            {q && <>
              <span className={`mono text-3xl font-semibold ${cls(q.chg)}`}>{price(q.price)}</span>
              <span className={`mono ${cls(q.chg)}`}>{q.chg > 0 ? "+" : ""}{price(q.chg)} ({pct(q.pct)})</span>
            </>}
            <span className="sub ml-auto">{m ? (m.open ? "盤中" : "已收盤") : ""}</span>
          </div>
          <KChart key={idx} code={idx === "t00" ? "TAIEX" : "OTC"} prev={q?.prev} height={300} tfs={["1m", "1d"]} defaultTf="1m" showVolume={false} compact />
          {b && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pb-4 pt-2 text-[13px]">
              <div><div className="sub">成交金額</div><div className="mono text-lg">{num(b.value)} 億</div></div>
              <div><div className="sub">漲停 / 跌停</div><div className="mono text-lg"><span className="up">{b.limitUp}</span> / <span className="down">{b.limitDown}</span></div></div>
              <div><div className="sub">三大法人{ch ? `（${md(ch.date)}）` : ""}</div><div className={`mono text-lg ${cls(ch?.market.total ?? 0)}`}>{ch ? `${ch.market.total > 0 ? "+" : ""}${ch.market.total.toFixed(2)} 億` : "—"}</div></div>
              <div>
                <div className="sub">漲 {b.up} · 平 {b.flat} · 跌 {b.down}</div>
                <div className="flex h-2 mt-2 rounded overflow-hidden gap-[2px]">
                  <div style={{ flex: b.up, background: "var(--up)" }} /><div style={{ flex: b.flat, background: "#666" }} /><div style={{ flex: b.down, background: "var(--down)" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card flex flex-col min-h-0">
          <div className="card-h">我的自選股 <Link href="/watchlist" className="text-[13px] text-[var(--gold)]">管理</Link></div>
          <div className="scroll-y max-h-[380px] px-2 pb-2">
            {watch.map((r) => (
              <div key={r.c} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-panel-2">
                <Link href={`/stock/${r.c}`} className="flex flex-1 items-center gap-3 min-w-0">
                  <span className="mono text-text-2 w-12">{r.c}</span>
                  <span className="flex-1 truncate">{r.n}</span>
                  <Spark data={sparks[r.c] ?? []} base={r.prev} w={70} h={20} />
                  <span className={`mono w-16 text-right ${cls(r.chg)}`}>{price(r.price)}</span>
                  <span className={`mono w-16 text-right ${cls(r.pct)}`}>{pct(r.pct)}</span>
                </Link>
                <button className="text-dim hover:text-text" onClick={() => wl.toggle(r.c)} aria-label={`移除 ${r.n}`}>✕</button>
              </div>
            ))}
            {!watch.length && (
              <>
                <div className="sub px-2 py-3">還沒有自選股。從下面成交最熱的股票加入，或在個股頁按「加入自選」。</div>
                {value.slice(0, 8).map((r) => (
                  <div key={r.c} className="flex items-center gap-3 px-2 py-1.5">
                    <span className="mono text-text-2 w-12">{r.c}</span><span className="flex-1 truncate">{r.n}</span>
                    <span className={`mono w-16 text-right ${cls(r.chg)}`}>{price(r.price)}</span>
                    <span className={`mono w-16 text-right ${cls(r.pct)}`}>{pct(r.pct)}</span>
                    <button className="btn !py-0.5" onClick={() => wl.toggle(r.c)}>＋ 加入</button>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="px-4 pb-3">{adding ? <StockPicker autoFocus onPick={(c) => { wl.toggle(c); setAdding(false); }} placeholder="輸入代號或名稱，按 Enter 加入" /> : <button className="w-full rounded-lg border border-dashed border-line py-1.5 sub hover:text-text" onClick={() => setAdding(true)}>搜尋並加入更多</button>}</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Rank title="漲幅排行" rows={gainers.map((r) => ({ c: r.c, n: r.n, p: r, v: <span className={cls(r.pct)}>{pct(r.pct)}</span> }))} />
        <Rank title="跌幅排行" rows={losers.map((r) => ({ c: r.c, n: r.n, p: r, v: <span className={cls(r.pct)}>{pct(r.pct)}</span> }))} />
        <Rank title="成交值排行" sub="股價 · 成交值(億)" rows={value.map((r) => ({ c: r.c, n: r.n, p: r, v: r.value.toFixed(1) }))} />
        <Rank title="外資買超" sub={ch ? `股價 · 買超(張) · ${md(ch.date)}` : "張"} rows={(ch?.rank.f.buy ?? []).slice(0, 30).map((r) => ({ c: r.c, n: r.n, p: byCode.get(r.c), v: <span className="up">+{num(r.lots)}</span> }))} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="card">
          <div className="card-h">飆股訊號 <Link href="/screener" className="text-[13px] text-[var(--gold)]">開啟選股器</Link></div>
          <div className="scroll-y max-h-[420px] px-2 pb-2">
            <table className="tbl">
              <thead><tr><th>股票</th><th className="!text-left">符合的訊號</th><th>股價</th><th>漲跌幅</th><th>RVOL</th></tr></thead>
              <tbody>
                {signals.map(({ s, tags }) => (
                  <tr key={s.c} className="click" onClick={() => router.push(`/stock/${s.c}`)}>
                    <td><span className="mono text-text-2 mr-2">{s.c}</span>{s.n}</td>
                    <td className="!text-left"><span className="flex gap-1 flex-wrap">{tags.map((t) => <span key={t} className={`chip ${t.includes("漲停") ? "!bg-[#3a1518] !text-[var(--up)]" : ""}`}>{t}</span>)}</span></td>
                    <td className={`mono ${cls(s.chg)}`}>{price(s.price)}</td>
                    <td className={`mono ${cls(s.pct)}`}>{pct(s.pct)}</td>
                    <td className="mono">{s.rvol.toFixed(1)}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!signals.length && <div className="sub text-center py-8">{scan ? "目前沒有股票同時亮兩個以上訊號" : "掃描中…"}</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-h">盤中動態 <Link href="/alerts" className="text-[13px] text-[var(--gold)]">提醒設定</Link></div>
          <div className="scroll-y max-h-[420px] px-2 pb-2">
            {(ev?.today ? ev.events : []).map((e, i) => (
              <Link key={i} href={`/stock/${e.c}`} className="flex gap-3 px-2 py-1.5 rounded-lg hover:bg-panel-2 text-[13px]">
                <span className="mono sub">{e.t}</span>
                <span className={e.k === "lockUp" ? "up" : e.k === "lockDn" ? "down" : e.k === "rvol" ? "text-[var(--gold-2)]" : ""}>{e.msg}</span>
              </Link>
            ))}
            {!(ev?.today && ev.events.length) && <div className="sub px-2 py-6 leading-relaxed">盤中每 30 秒比對一次：漲跌停鎖住／打開、同時段量能爆增，會依時間列在這裡。</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Rank({ title, rows, sub }: { title: string; rows: { c: string; n: string; p?: ScanRow; v: React.ReactNode }[]; sub?: string }) {
  return (
    <div className="card flex flex-col min-h-0">
      <div className="card-h">{title}{sub && <span className="sub">{sub}</span>}</div>
      <div className="scroll-y max-h-[260px] px-2 pb-2">
        {rows.map((r) => (
          <Link key={r.c} href={`/stock/${r.c}`} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-panel-2">
            <span className="mono text-text-2 w-12">{r.c}</span><span className="flex-1 truncate">{r.n}</span>
            {r.p && <span className={`mono w-16 text-right ${cls(r.p.chg)}`}>{price(r.p.price)}</span>}
            <span className="mono w-20 text-right">{r.v}</span>
          </Link>
        ))}
        {!rows.length && <div className="sub px-2 py-6 text-center loading">載入中…</div>}
      </div>
    </div>
  );
}
