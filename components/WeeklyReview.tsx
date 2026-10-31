"use client";
// 首頁「一週回顧」：每週六集保公布後由 AI 整理的這週重點（scripts/weekly-review.ts），附下週法說會名單
import Link from "next/link";
import { usePoll } from "./hooks";
import { cls, pct } from "./fmt";
import Help from "./Help";
import Highlight from "./Highlight";

type Weekly = {
  date: string; from: string; headline: string; points: string[]; watch: string; error?: string;
  stats: { taiex?: { pct: number }; otc?: { pct: number }; insti?: { f: number; t: number; d: number }; fut?: { tx: number; chg: number } };
  calls: { c: string; n: string; d: string; text: string }[];
};
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const yi = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString()} 億`;

export default function WeeklyReview() {
  const { data: w } = usePoll<Weekly>("/api/summary?kind=weekly", 30 * 60_000);
  const s = w?.stats;
  return (
    <div className="card" id="weekly">
      <div className="card-h">一週回顧<span className="sub mr-auto">{w?.date && `${md(w.from)}～${md(w.date)} · `}每週六更新</span>
        <Link href="/alerts" className="text-[13px] text-[var(--gold)] mr-1">推播到手機</Link>
        <Help align="right">每週六早上集保（千張大戶）資料公布後，把這週的大盤、族群、三大法人、外資期貨、融資、千張大戶，以及每天的盤後重點、國際焦點、重要公告交給 AI 整理成重點。數字都是程式算的；下週法說會是程式從重大訊息裡找出來的。不構成買賣建議。想收到通知，到「提醒」建立「一週回顧」並開啟背景推播。</Help>
      </div>
      <div className="px-4 pb-4 text-[13.5px] leading-relaxed">
        {w && !w.error ? (
          <>
            <div className="font-semibold text-[15px] mb-1.5"><Highlight text={w.headline} /></div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 text-[12.5px]">
              {s?.taiex && <span><span className="text-text-2">加權</span> <span className={cls(s.taiex.pct)}>{pct(s.taiex.pct)}</span></span>}
              {s?.otc && <span><span className="text-text-2">櫃買</span> <span className={cls(s.otc.pct)}>{pct(s.otc.pct)}</span></span>}
              {s?.insti && <span><span className="text-text-2">外資</span> <span className={cls(s.insti.f)}>{yi(s.insti.f)}</span></span>}
              {s?.insti && <span><span className="text-text-2">投信</span> <span className={cls(s.insti.t)}>{yi(s.insti.t)}</span></span>}
              {s?.fut && <span><span className="text-text-2">外資期貨</span> {s.fut.tx.toLocaleString()} 口（<span className={cls(s.fut.chg)}>{s.fut.chg > 0 ? "+" : ""}{s.fut.chg.toLocaleString()}</span>）</span>}
            </div>
            <ul className="list-disc pl-5 space-y-0.5">{w.points.map((p, i) => <li key={i}><Highlight text={p} /></li>)}</ul>
            {w.watch && <div className="mt-2 text-text-2"><span className="text-[var(--gold-2)]">下週留意</span>　<Highlight text={w.watch} /></div>}
            {w.calls.length > 0 && (
              <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
                <span className="text-[var(--gold-2)] mr-1">下週法說會</span>
                {w.calls.map((x) => <Link key={x.c + x.d} href={`/stock/${x.c}`} title={x.text} className="chip hover:brightness-125">{md(x.d)} {x.n}</Link>)}
              </div>
            )}
          </>
        ) : <div className="sub py-2">{w?.error ?? "載入中…"}（每週六早上更新）</div>}
      </div>
    </div>
  );
}
