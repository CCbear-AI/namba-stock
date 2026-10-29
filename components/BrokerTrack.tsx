"use client";
// 自選股的「分點追蹤」：追蹤「股票＋分點」組合，每天看它買了幾張、連買幾天
import { useMemo, useState } from "react";
import { usePoll } from "@/components/hooks";
import { cls, price } from "@/components/fmt";
import StockPicker from "@/components/StockPicker";
import { Dot, md, sg, streakText, useTrack, type Cls, type K } from "@/components/brokerUi";

type TV = { dates: string[]; rows: { c: string; n: string; id: string; b: string; k: K; cls: Cls; last10: number[]; sum5: number; sum20: number; streak: number; cost: number | null; close: number | null }[] };
type SV = { error?: string; code: string; brokers: { id: string; n: string }[] };

export default function BrokerTrack({ onStock, code = "2330" }: { onStock: (c: string) => void; code?: string }) {
  const tr = useTrack();
  const [c, setC] = useState(code);
  const { data: sv } = usePoll<SV>(`/api/brokers?view=stock&code=${c}&days=5`);
  const items = useMemo(() => tr.list.map((t) => `${t.c}:${t.id}`).join(","), [tr.list]);
  const { data } = usePoll<TV>(items ? `/api/brokers?view=track&items=${items}` : null);
  return (
    <div className="grid gap-4">
      <div className="px-4 grid gap-2">
        <div className="flex flex-wrap items-center gap-3"><span className="font-semibold">新增追蹤</span><span className="sub">選一檔股票，再點分點就加入（也可以在「分點」頁的分點 K 線按「追蹤這組」）</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <StockPicker className="w-[240px]" keep placeholder={`股票：${c}`} onPick={setC} />
          {sv?.error && <span className="sub">{sv.error}</span>}
          {sv && !sv.error && sv.brokers.slice(0, 16).map((b) => (
            <button key={b.id} className={`btn !py-0.5 !px-2.5 ${tr.has(sv.code, b.id) ? "on" : ""}`} onClick={() => tr.toggle({ c: sv.code, id: b.id, b: b.n })}>{tr.has(sv.code, b.id) ? "★" : "+"} {b.n}</button>
          ))}
        </div>
      </div>
      {!tr.list.length ? <div className="sub py-10 text-center">還沒有追蹤任何「股票＋分點」。之後每天在這裡看它買了幾張、連買幾天，不用一檔一檔查。</div> : !data ? <div className="sub py-10 text-center loading">載入中…</div> : (
        <div className="scroll-x px-2 pb-3">
          <table className="tbl text-[13px]">
            <thead><tr><th>股票</th><th style={{ textAlign: "left" }}>分點</th><th style={{ textAlign: "left" }}>近 10 日（{md(data.dates[0])}–{md(data.dates.at(-1)!)}）</th><th>今天</th><th>近 5 日</th><th>近 20 日</th><th>狀態</th><th>估算成本</th><th /></tr></thead>
            <tbody>{data.rows.map((r) => {
              const max = Math.max(1, ...r.last10.map(Math.abs));
              return (
                <tr key={r.c + r.id} className="click" onClick={() => onStock(r.c)}>
                  <td>{r.n} <span className="mono sub">{r.c}</span></td>
                  <td style={{ textAlign: "left" }}><span className="flex items-center"><Dot k={r.k} c={r.cls} />{r.b}</span></td>
                  <td><div className="flex items-center gap-[3px] h-6 min-w-[150px]">{r.last10.map((v, i) => <span key={i} title={`${md(data.dates[i])} ${sg(v)} 張`} className="flex-1 flex flex-col justify-center h-full"><span className="rounded-[2px] mx-auto w-full" style={{ height: `${Math.max(2, (Math.abs(v) / max) * 100)}%`, background: v > 0 ? "var(--up)" : v < 0 ? "var(--down)" : "#333840" }} /></span>)}</div></td>
                  <td className={`mono ${cls(r.last10.at(-1) ?? 0)}`}>{sg(r.last10.at(-1) ?? 0)}</td>
                  <td className={`mono ${cls(r.sum5)}`}>{sg(r.sum5)}</td><td className={`mono ${cls(r.sum20)}`}>{sg(r.sum20)}</td>
                  <td className="sub">{streakText(r.streak) || "—"}</td>
                  <td className="mono">{r.cost && r.close ? <>{price(r.cost)} <span className={cls(r.close - r.cost)}>{(((r.close - r.cost) / r.cost) * 100).toFixed(1)}%</span></> : "—"}</td>
                  <td><button aria-label="取消追蹤" className="sub hover:text-text px-1" onClick={(e) => { e.stopPropagation(); tr.toggle({ c: r.c, id: r.id, b: r.b }); }}>✕</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
