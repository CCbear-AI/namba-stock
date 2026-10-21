"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import KChart from "@/components/KChart";
import StockPicker from "@/components/StockPicker";
import AlertDialog from "@/components/AlertDialog";
import ExportBtn from "@/components/ExportBtn";
import { ChipsSummary, Branches } from "@/components/StockChips";
import { usePoll, useRecent, useWatchlist } from "@/components/hooks";
import { cls, pct, price, num, hm } from "@/components/fmt";
import type { Quote } from "@/lib/mis";
import type { Bar, Row } from "@/lib/types";

type Q = Quote & { ind: string; row: Row | null; error?: string; flow: { buy: number; sell: number; value: number } | null; avg: number | null };

export default function StockPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { data: q, error } = usePoll<Q>(`/api/quote?code=${code}`, 10_000);
  const wl = useWatchlist();
  const recent = useRecent();
  const [picking, setPicking] = useState(false);
  const [alert, setAlert] = useState(false);
  useEffect(() => { recent.push(code); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  const chg = q ? q.price - q.prev : 0;
  // 自選股上一檔／下一檔
  const i = wl.list.indexOf(code);
  const go = (d: number) => { if (!wl.list.length) return; const n = wl.list[(i < 0 ? 0 : i + d + wl.list.length) % wl.list.length]; router.push(`/stock/${n}`); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.target instanceof HTMLInputElement) return; if (e.key === "ArrowUp" && e.altKey) go(-1); if (e.key === "ArrowDown" && e.altKey) go(1); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  return (
    <div className="grid gap-4" id="stock-area">
      <div className="card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {picking ? <StockPicker autoFocus className="w-72" onPick={(c) => { setPicking(false); router.push(`/stock/${c}`); }} placeholder="換一檔：代號或名稱" />
            : <button aria-label="換標的" title="換標的" className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 hover:border-dim" onClick={() => setPicking(true)}>
              <span className="mono text-text-2 text-lg">{code}</span><span className="text-xl font-bold">{q?.n ?? ""}</span><span className="text-text-2">⌄</span>
            </button>}
          {q?.ind && <Link href="/sector" className="chip">{q.m === "otc" ? "上櫃" : "上市"} · {q.ind} ›</Link>}
          <div className="flex items-center gap-1" data-noexport>
            <button className="w-8 h-8 rounded-lg border border-line hover:border-dim disabled:opacity-30" title="自選股上一檔" aria-label="自選股上一檔" disabled={!wl.list.length} onClick={() => go(-1)}>︿</button>
            <button className="w-8 h-8 rounded-lg border border-line hover:border-dim disabled:opacity-30" title="自選股下一檔" aria-label="自選股下一檔" disabled={!wl.list.length} onClick={() => go(1)}>﹀</button>
            {wl.list.length > 0 && <span className="sub mono">{i >= 0 ? i + 1 : "—"}/{wl.list.length}</span>}
          </div>
          {q && q.price > 0 && Array.isArray(q.bid) && <>
            <span className={`mono text-3xl font-semibold ${cls(chg)}`}>{price(q.price)}</span>
            <span className={`mono ${cls(chg)}`}>{chg > 0 ? "+" : ""}{price(chg)} ({pct(q.prev ? (chg / q.prev) * 100 : 0)})</span>
            <span className="sub mono">{hm(q.time)}</span>
          </>}
          <div className="flex-1" />
          <span data-noexport className="flex gap-2">
            <ExportBtn name={`${code}${q?.n ?? ""}`} target={() => document.getElementById("stock-area")} label="匯出圖片" />
            <button className={`btn ${wl.has(code) ? "on" : "gold"}`} onClick={() => wl.toggle(code)}>{wl.has(code) ? "✓ 已加入自選" : "☆ 加入自選"}</button>
            <button className="btn" onClick={() => setAlert(true)} disabled={!q}>🔔 設定提醒</button>
          </span>
        </div>
        {q && q.price > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] mono text-text-2">
            <span>開盤 <span className={cls(q.open - q.prev)}>{price(q.open)}</span></span>
            <span>最高 <span className={cls(q.high - q.prev)}>{price(q.high)}</span></span>
            <span>最低 <span className={cls(q.low - q.prev)}>{price(q.low)}</span></span>
            {q.avg != null && <span>均價 <span className={cls(q.avg - q.prev)}>{price(q.avg)}</span></span>}
            <span>昨收 <span className="text-text">{price(q.prev)}</span></span>
            <span>漲停價 <span className="up">{price(q.up)}</span></span>
            <span>跌停價 <span className="down">{price(q.down)}</span></span>
            <span>成交量 <span className="text-text">{num(q.vol)} 張</span></span>
            {q.row && <span>成交金額 <span className="text-text">{(q.flow?.value ?? q.row.value).toFixed(0)} 億</span></span>}
            {q.row && <span>市值 <span className="text-text">{num(q.row.cap)} 億</span></span>}
          </div>
        )}
        {(error || q?.error) && <div className="sub mt-2">{q?.error ?? error}</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="card overflow-hidden"><KChart code={code} title={`${code}${q?.n ?? ""}`} prev={q?.prev} height={500} /></div>
        <div className="grid gap-4 content-start">
          {q && Array.isArray(q.bid) && <Book q={q} />}
          <Ticks code={code} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-h">個股籌碼 <Link href={`/chips?code=${code}`} className="text-[13px] text-[var(--gold)]">看完整籌碼 ›</Link></div>
          <ChipsSummary code={code} />
        </div>
        <div className="card">
          <div className="card-h">主力分點</div>
          <Branches code={code} />
        </div>
      </div>
      {alert && q && <AlertDialog code={code} name={q.n} price={q.price} onClose={() => setAlert(false)} />}
    </div>
  );
}

function Book({ q }: { q: Q }) {
  const max = Math.max(1, ...q.askV, ...q.bidV);
  const rows = Array.from({ length: 5 }, (_, i) => i);
  const f = q.flow;
  const outPct = f && f.buy + f.sell > 0 ? (f.buy / (f.buy + f.sell)) * 100 : null;
  return (
    <div className="card">
      <div className="card-h">最佳五檔 <span className="sub">單位：張</span></div>
      <div className="px-3 pb-3 text-[13px] mono">
        <div className="grid grid-cols-4 text-dim text-[12px] pb-1"><span>委買量</span><span className="text-right">買價</span><span className="text-right">賣價</span><span className="text-right">委賣量</span></div>
        {rows.map((i) => (
          <div key={i} className="grid grid-cols-4 items-center py-[3px]">
            <span className="relative">
              <span className="absolute right-0 top-0 bottom-0 bg-[var(--up)]/15 rounded-l" style={{ width: `${((q.bidV[i] ?? 0) / max) * 100}%` }} />
              <span className="relative">{q.bidV[i] != null ? num(q.bidV[i]) : ""}</span>
            </span>
            <span className={`text-right ${cls((q.bid[i] ?? q.prev) - q.prev)}`}>{q.bid[i] ? price(q.bid[i]) : "—"}</span>
            <span className={`text-right ${cls((q.ask[i] ?? q.prev) - q.prev)}`}>{q.ask[i] ? price(q.ask[i]) : "—"}</span>
            <span className="relative text-right">
              <span className="absolute left-0 top-0 bottom-0 bg-[var(--down)]/15 rounded-r" style={{ width: `${((q.askV[i] ?? 0) / max) * 100}%` }} />
              <span className="relative">{q.askV[i] != null ? num(q.askV[i]) : ""}</span>
            </span>
          </div>
        ))}
        {outPct != null ? (
          <>
            <div className="flex justify-between text-[12px] mt-3"><span className="up">外盤 {outPct.toFixed(0)}%</span><span className="down">{(100 - outPct).toFixed(0)}% 內盤</span></div>
            <div className="flex h-1.5 mt-1 rounded overflow-hidden gap-[2px]"><div style={{ flex: outPct, background: "var(--up)" }} /><div style={{ flex: 100 - outPct, background: "var(--down)" }} /></div>
            <div className="flex justify-between text-[12px] mt-1 text-text-2"><span>{num(Math.round((q.vol * outPct) / 100))} 張</span><span>{num(Math.round((q.vol * (100 - outPct)) / 100))} 張</span></div>
          </>
        ) : (
          <>
            <div className="flex h-1.5 mt-3 rounded overflow-hidden"><div style={{ flex: q.bidV.reduce((a, b) => a + b, 0) || 1, background: "var(--up)" }} /><div style={{ flex: q.askV.reduce((a, b) => a + b, 0) || 1, background: "var(--down)" }} /></div>
            <div className="flex justify-between text-[12px] mt-1"><span className="up">委買 {num(q.bidV.reduce((a, b) => a + b, 0))}</span><span className="down">委賣 {num(q.askV.reduce((a, b) => a + b, 0))}</span></div>
          </>
        )}
      </div>
    </div>
  );
}

function Ticks({ code }: { code: string }) {
  const { data } = usePoll<{ bars: Bar[] }>(`/api/candles?code=${code}&tf=1m`, 30_000);
  const bars = [...(data?.bars ?? [])].reverse();
  const big = bars.length ? Math.max(...bars.map((b) => b.volume)) * 0.35 : Infinity;
  return (
    <div className="card">
      <div className="card-h">分時明細 <span className="sub">每分鐘一筆 · 非逐筆</span></div>
      <div className="scroll-y max-h-[300px] px-2 pb-2">
        <table className="tbl text-[13px]">
          <thead><tr><th>時間</th><th>成交價</th><th>單量</th></tr></thead>
          <tbody>
            {bars.map((b, i) => {
              const prev = bars[i + 1]?.close ?? b.open;
              return (
                <tr key={b.time}>
                  <td className="mono text-text-2">{new Date((b.time + 8 * 3600) * 1000).toISOString().slice(11, 16)}</td>
                  <td className={`mono ${cls(b.close - prev)}`}>{price(b.close)}</td>
                  <td className="mono">{b.volume >= big && b.volume >= 100 ? <span className="chip mr-1">大量</span> : null}{num(b.volume)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!bars.length && <div className="sub text-center py-6">今天還沒有分時資料</div>}
      </div>
    </div>
  );
}
