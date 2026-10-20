"use client";
import { useParams } from "next/navigation";
import KChart from "@/components/KChart";
import { usePoll, useWatchlist } from "@/components/hooks";
import { cls, pct, price, num } from "@/components/fmt";
import type { Quote } from "@/lib/mis";
import type { Bar, Row } from "@/lib/types";

type Q = Quote & { ind: string; row: Row | null; error?: string };

export default function StockPage() {
  const { code } = useParams<{ code: string }>();
  const { data: q, error } = usePoll<Q>(`/api/quote?code=${code}`, 10_000);
  const wl = useWatchlist();
  const chg = q ? q.price - q.prev : 0;

  return (
    <div className="grid gap-4">
      <div className="card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono text-text-2 text-lg">{code}</span>
          <span className="text-xl font-bold">{q?.n ?? ""}</span>
          {q?.ind && <span className="chip">{q.m === "otc" ? "上櫃" : "上市"} · {q.ind}</span>}
          {q && q.price > 0 && <>
            <span className={`mono text-3xl font-semibold ${cls(chg)}`}>{price(q.price)}</span>
            <span className={`mono ${cls(chg)}`}>{chg > 0 ? "+" : ""}{price(chg)} ({pct(q.prev ? (chg / q.prev) * 100 : 0)})</span>
          </>}
          <div className="flex-1" />
          <button className={`btn ${wl.has(code) ? "on" : "gold"}`} onClick={() => wl.toggle(code)}>{wl.has(code) ? "★ 已在自選" : "☆ 加入自選"}</button>
        </div>
        {q && q.price > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] mono text-text-2">
            <span>開盤 <span className={cls(q.open - q.prev)}>{price(q.open)}</span></span>
            <span>最高 <span className={cls(q.high - q.prev)}>{price(q.high)}</span></span>
            <span>最低 <span className={cls(q.low - q.prev)}>{price(q.low)}</span></span>
            <span>昨收 <span className="text-text">{price(q.prev)}</span></span>
            <span>漲停 <span className="up">{price(q.up)}</span></span>
            <span>跌停 <span className="down">{price(q.down)}</span></span>
            <span>成交量 <span className="text-text">{num(q.vol)} 張</span></span>
            {q.row && <span>成交值 <span className="text-text">{q.row.value.toFixed(1)} 億</span></span>}
            {q.row && <span>市值 <span className="text-text">{num(q.row.cap)} 億</span></span>}
          </div>
        )}
        {(error || q?.error) && <div className="sub mt-2">{q?.error ?? error}</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="card overflow-hidden"><KChart code={code} prev={q?.prev} height={480} /></div>
        <div className="grid gap-4 content-start">
          {q && <Book q={q} />}
          <Ticks code={code} />
        </div>
      </div>
    </div>
  );
}

function Book({ q }: { q: Q }) {
  const max = Math.max(1, ...q.askV, ...q.bidV);
  const rows = Array.from({ length: 5 }, (_, i) => i);
  const bidSum = q.bidV.reduce((a, b) => a + b, 0), askSum = q.askV.reduce((a, b) => a + b, 0);
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
        <div className="flex h-1.5 mt-3 rounded overflow-hidden">
          <div style={{ flex: bidSum || 1, background: "var(--up)" }} /><div style={{ flex: askSum || 1, background: "var(--down)" }} />
        </div>
        <div className="flex justify-between text-[12px] mt-1"><span className="up">委買 {num(bidSum)}</span><span className="down">委賣 {num(askSum)}</span></div>
      </div>
    </div>
  );
}

function Ticks({ code }: { code: string }) {
  const { data } = usePoll<{ bars: Bar[] }>(`/api/candles?code=${code}&tf=1m`, 30_000);
  const bars = [...(data?.bars ?? [])].reverse();
  return (
    <div className="card">
      <div className="card-h">分時明細 <span className="sub">每分鐘一筆</span></div>
      <div className="scroll-y max-h-[300px] px-2 pb-2">
        <table className="tbl text-[13px]">
          <thead><tr><th>時間</th><th>成交價</th><th>單量(張)</th></tr></thead>
          <tbody>
            {bars.map((b, i) => {
              const prev = bars[i + 1]?.close ?? b.open;
              return (
                <tr key={b.time}>
                  <td className="mono text-text-2">{new Date((b.time + 8 * 3600) * 1000).toISOString().slice(11, 16)}</td>
                  <td className={`mono ${cls(b.close - prev)}`}>{price(b.close)}</td>
                  <td className="mono">{b.volume >= 500 ? <span className="chip mr-1">大量</span> : null}{num(b.volume)}</td>
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
