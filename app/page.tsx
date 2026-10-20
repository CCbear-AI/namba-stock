"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import KChart from "@/components/KChart";
import { RankCard, pctCell } from "@/components/Rank";
import { usePoll, useWatchlist } from "@/components/hooks";
import { cls, pct, price, num } from "@/components/fmt";
import type { Market, Row } from "@/lib/types";

export default function Home() {
  const { data: m } = usePoll<Market>("/api/market", 20_000);
  const wl = useWatchlist();
  const router = useRouter();
  const stocks = useMemo(() => (m?.stocks ?? []).filter((s) => s.vol > 0), [m]);
  const by = (f: (a: Row, b: Row) => number, n = 30) => [...stocks].sort(f).slice(0, n);
  const gainers = by((a, b) => b.pct - a.pct);
  const losers = by((a, b) => a.pct - b.pct);
  const value = by((a, b) => b.value - a.value);
  const taiex = m?.indices.find((q) => q.c === "t00");
  const b = m?.breadth;
  const signals = useMemo(() => stocks
    .map((s) => {
      const tags: string[] = [];
      if (s.up && s.price >= s.up) tags.push("漲停");
      else if (s.pct >= 7) tags.push("強勢 7%+");
      if (s.high > s.low && s.price >= s.high && s.pct > 3) tags.push("收最高");
      if (s.value >= 20) tags.push("大量");
      return { s, tags };
    })
    .filter((x) => x.tags.length >= 2 || x.tags.includes("漲停"))
    .sort((a, b) => b.s.pct - a.s.pct || b.s.value - a.s.value)
    .slice(0, 30), [stocks]);
  const sectors = useMemo(() => {
    const g: Record<string, { cap: number; w: number }> = {};
    for (const s of stocks) {
      const x = (g[s.ind] ??= { cap: 0, w: 0 });
      x.cap += s.cap; x.w += s.cap * s.pct;
    }
    return Object.entries(g).map(([k, v]) => ({ k, pct: v.cap ? v.w / v.cap : 0 })).sort((a, b) => b.pct - a.pct);
  }, [stocks]);
  const watch = wl.list.map((c) => m?.stocks.find((s) => s.c === c)).filter(Boolean) as Row[];

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="card overflow-hidden">
          <div className="px-4 pt-4 flex items-baseline gap-3 flex-wrap">
            <span className="sub">加權指數</span>
            {taiex && <>
              <span className={`mono text-3xl font-semibold ${cls(taiex.chg)}`}>{price(taiex.price)}</span>
              <span className={`mono ${cls(taiex.chg)}`}>{taiex.chg > 0 ? "+" : ""}{price(taiex.chg)} ({pct(taiex.pct)})</span>
            </>}
            <span className="sub ml-auto">{m ? (m.open ? "盤中" : "已收盤") : ""}</span>
          </div>
          <KChart code="TAIEX" prev={taiex?.prev} height={300} tfs={["1m", "1d"]} defaultTf="1m" showVolume={false} compact />
          {b && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pb-4 pt-2 text-[13px]">
              <div><div className="sub">成交金額（估）</div><div className="mono text-lg">{num(b.value)} 億</div></div>
              <div><div className="sub">漲停 / 跌停</div><div className="mono text-lg"><span className="up">{b.limitUp}</span> / <span className="down">{b.limitDown}</span></div></div>
              <div className="col-span-2">
                <div className="sub">漲 {b.up} · 平 {b.flat} · 跌 {b.down}</div>
                <div className="flex h-2 mt-2 rounded overflow-hidden gap-[2px]">
                  <div style={{ flex: b.up, background: "var(--up)" }} />
                  <div style={{ flex: b.flat, background: "#666" }} />
                  <div style={{ flex: b.down, background: "var(--down)" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card flex flex-col min-h-0">
          <div className="card-h">我的自選股 <span className="sub">存在這台裝置的瀏覽器</span></div>
          <div className="scroll-y max-h-[420px] px-2 pb-2">
            {watch.map((r) => (
              <div key={r.c} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-panel-2">
                <Link href={`/stock/${r.c}`} className="flex flex-1 items-center gap-3 min-w-0">
                  <span className="mono text-text-2 w-12">{r.c}</span>
                  <span className="flex-1 truncate">{r.n}</span>
                  <span className={`mono ${cls(r.chg)}`}>{price(r.price)}</span>
                  <span className={`mono w-16 text-right ${cls(r.pct)}`}>{pct(r.pct)}</span>
                </Link>
                <button className="text-dim hover:text-text" onClick={() => wl.toggle(r.c)} aria-label="移除">✕</button>
              </div>
            ))}
            {!watch.length && (
              <>
                <div className="sub px-2 py-3">還沒有自選股。從下面成交最熱的股票加入，或在個股頁按「加入自選」。</div>
                {value.slice(0, 10).map((r) => (
                  <div key={r.c} className="flex items-center gap-3 px-2 py-1.5">
                    <span className="mono text-text-2 w-12">{r.c}</span>
                    <span className="flex-1 truncate">{r.n}</span>
                    <span className={`mono ${cls(r.pct)}`}>{pct(r.pct)}</span>
                    <button className="btn !py-0.5" onClick={() => wl.toggle(r.c)}>＋ 加入</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <RankCard title="漲幅排行" rows={gainers} value={pctCell} />
        <RankCard title="跌幅排行" rows={losers} value={pctCell} />
        <RankCard title="成交值排行" sub="億（估）" rows={value} value={(r) => r.value.toFixed(1)} />
        <div className="card flex flex-col min-h-0">
          <div className="card-h">族群漲跌 <span className="sub">市值加權</span></div>
          <div className="scroll-y max-h-[260px] px-4 pb-3">
            {sectors.map((s) => (
              <div key={s.k} className="flex items-center gap-2 py-1">
                <span className="w-20 truncate">{s.k}</span>
                <div className="flex-1 h-2 bg-panel-2 rounded overflow-hidden">
                  <div style={{ width: `${Math.min(100, Math.abs(s.pct) * 20)}%`, background: s.pct >= 0 ? "var(--up)" : "var(--down)", height: "100%" }} />
                </div>
                <span className={`mono w-16 text-right ${cls(s.pct)}`}>{pct(s.pct)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">飆股訊號 <span className="sub">漲停、強勢、收最高、大量</span></div>
        <div className="scroll-y max-h-[360px] px-2 pb-2">
          <table className="tbl">
            <thead><tr><th>股票</th><th className="!text-left">符合的訊號</th><th>股價</th><th>漲跌幅</th><th>成交值(億)</th></tr></thead>
            <tbody>
              {signals.map(({ s, tags }) => (
                <tr key={s.c} className="click" onClick={() => router.push(`/stock/${s.c}`)}>
                  <td><span className="mono text-text-2 mr-2">{s.c}</span>{s.n}</td>
                  <td className="!text-left"><span className="flex gap-1 flex-wrap">{tags.map((t) => <span key={t} className="chip">{t}</span>)}</span></td>
                  <td className={`mono ${cls(s.chg)}`}>{price(s.price)}</td>
                  <td className={`mono ${cls(s.pct)}`}>{pct(s.pct)}</td>
                  <td className="mono">{s.value.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
