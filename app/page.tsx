"use client";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import KChart from "@/components/KChart";
import Spark from "@/components/Spark";
import DragGrid from "@/components/DragGrid";
import StockPicker from "@/components/StockPicker";
import { usePoll, useScan, useWatchlist } from "@/components/hooks";
import { useSparks } from "@/components/useSparks";
import { cls, pct, price, num } from "@/components/fmt";
import { signalTags } from "@/lib/conditions";
import type { Market } from "@/lib/types";
import type { ScanRow } from "@/lib/scan";
import type { FlowEvent } from "@/lib/flow";
import Help, { Term } from "@/components/Help";
import Highlight from "@/components/Highlight";
import WorldFocus from "@/components/WorldFocus";
import WeeklyReview from "@/components/WeeklyReview";
import { RVOL_HELP, tagHelp } from "@/components/glossary";

type Summary = { date: string; headline: string; points: string[]; watch: string; model: string };
type Chips = { date: string; market: { total: number }; rank: { f: { buy: { c: string; n: string; lots: number }[] } } };
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function Home() {
  const router = useRouter();
  const { data: m } = usePoll<Market>("/api/market?lite=1", 20_000);
  const { data: scan } = useScan();
  const { data: ch } = usePoll<Chips>("/api/chips");
  const { data: ev } = usePoll<{ events: FlowEvent[]; today: boolean }>("/api/events", 30_000);
  const { data: sum } = usePoll<Summary & { error?: string }>("/api/summary", 10 * 60_000);
  const { data: rep } = usePoll<Summary & { error?: string }>("/api/summary?kind=report", 10 * 60_000);
  const wl = useWatchlist();
  const [idx, setIdx] = useState<"t00" | "o00">("t00");
  const [idxTf, setIdxTf] = useState<"1m" | "1d">("1m");
  const phone = usePhone();
  const [idxLine, setIdxLine] = useState(false);
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

  // 首頁面板：可以拖曳換位置，順序記在這台裝置
  const panels: Record<string, { span: string; node: React.ReactNode }> = {
    index: { span: "md:col-span-12 lg:col-span-8", node: (
      <div className="card overflow-hidden">
        <div className="px-4 pt-4 flex items-baseline gap-3 flex-wrap">
          <div className="seg"><button className={idx === "t00" ? "on" : ""} onClick={() => setIdx("t00")}>加權指數</button><button className={idx === "o00" ? "on" : ""} onClick={() => setIdx("o00")}>櫃買指數</button></div>
          {q && <>
            <span className={`mono text-3xl font-semibold ${cls(q.chg)}`}>{price(q.price)}</span>
            <span className={`mono ${cls(q.chg)}`}>{q.chg > 0 ? "+" : ""}{price(q.chg)} ({pct(q.pct)})</span>
          </>}
          <span className="sub ml-auto">{m ? (m.open ? "盤中" : "已收盤") : ""}</span>
          <div className="seg"><button className={idxTf === "1m" ? "on" : ""} onClick={() => setIdxTf("1m")}>分時</button><button className={idxTf === "1d" ? "on" : ""} onClick={() => setIdxTf("1d")}>日 K</button></div>
          {idxTf === "1d" && <button className={`btn ${idxLine ? "on" : ""}`} onClick={() => setIdxLine(!idxLine)}>折線</button>}
        </div>
        <KChart key={idx} code={idx === "t00" ? "TAIEX" : "OTC"} prev={q?.prev} tf={idxTf} line={idxLine} height={phone ? 200 : 300} showVolume={false} compact />
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
    ) },
    watch: { span: "md:col-span-12 lg:col-span-4", node: (
      <div className="card flex flex-col min-h-0">
        <div className="card-h">我的自選股 <Link href="/watchlist" className="text-[13px] text-[var(--gold)]">管理</Link></div>
        {/* 一列：代號小字＋名稱、當日小走勢、股價／漲跌幅上下疊；卡片太窄就先藏走勢圖，✕ 滑過才出現 */}
        <div className="@container scroll-y max-h-[380px] px-2 pb-2">
          {watch.map((r) => (
            <div key={r.c} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-panel-2">
              <Link href={`/stock/${r.c}`} className="flex flex-1 items-center gap-3 min-w-0">
                <span className="flex-1 min-w-0 truncate"><span className="mono text-[11px] text-text-2 mr-1.5">{r.c}</span>{r.n}</span>
                <span className="hidden @[250px]:block shrink-0"><Spark data={sparks[r.c] ?? []} base={r.prev} w={76} h={24} /></span>
                <PriceCell r={r} />
              </Link>
              <button className="w-4 shrink-0 text-dim hover:text-text opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100" onClick={() => wl.toggle(r.c)} aria-label={`移除 ${r.n}`}>✕</button>
            </div>
          ))}
          {/* 自選股不到 5 檔：空白處補成交最熱的幾檔，可以直接加入 */}
          {watch.length < 5 && (
            <>
              <div className="sub px-2 pt-3 pb-1">{watch.length ? "成交最熱 · 可直接加入自選" : "還沒有自選股。從成交最熱的股票加入，或在個股頁按「加入自選」。"}</div>
              {value.filter((r) => !wl.list.includes(r.c)).slice(0, 8 - watch.length).map((r) => (
                <div key={r.c} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-panel-2">
                  <Link href={`/stock/${r.c}`} className="flex flex-1 items-center gap-3 min-w-0">
                    <span className="flex-1 min-w-0 truncate"><span className="mono text-[11px] text-text-2 mr-1.5">{r.c}</span>{r.n}</span>
                    <PriceCell r={r} />
                  </Link>
                  <button className="btn !py-0.5 !px-2 shrink-0" onClick={() => wl.toggle(r.c)} aria-label={`加入 ${r.n}`}>＋ 加入</button>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="px-4 pb-3">{adding ? <StockPicker autoFocus onPick={(c) => { wl.toggle(c); setAdding(false); }} placeholder="輸入代號或名稱，按 Enter 加入" /> : <button className="w-full rounded-lg border border-dashed border-line py-1.5 sub hover:text-text" onClick={() => setAdding(true)}>搜尋並加入更多</button>}</div>
      </div>
    ) },
    summary: { span: "md:col-span-12", node: (
      <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid"><WorldFocus /></div>
      <div className="card">
        <div className="card-h">盤後重點<span className="sub mr-auto">{sum?.date && `${md(sum.date)} · `}每個交易日台灣 16:30 更新</span>
          <Help align="right">收盤後由 AI 依當天數字（大盤、漲跌家數、族群、法人、期貨、國際行情）整理的重點。每個交易日台灣 16:30 開始整理，通常 17:00 前更新完成。數字都是程式算的，AI 只負責寫成白話；不構成買賣建議。</Help>
        </div>
        <div className="px-4 pb-4 text-[13.5px] leading-relaxed">
          {sum && !sum.error ? (
            <>
              <div className="font-semibold text-[15px] mb-1.5"><Highlight text={sum.headline} /></div>
              <ul className="list-disc pl-5 space-y-0.5">{sum.points.map((p, i) => <li key={i}><Highlight text={p} /></li>)}</ul>
              {sum.watch && <div className="mt-2 text-text-2"><span className="text-[var(--gold-2)]">明日留意</span>　<Highlight text={sum.watch} /></div>}
            </>
          ) : <div className="sub py-2">{sum?.error ?? "載入中…"}（每個交易日 16:30 後更新）</div>}
        </div>
      </div>
      <div className="card" id="report">
        <div className="card-h">分點晚報<span className="sub mr-auto">{rep?.date && `${md(rep.date)} · `}每個交易日晚上 22:00 後更新</span>
          <Link href="/alerts" className="text-[13px] text-[var(--gold)] mr-1">推播到手機</Link>
          <Help align="right">券商分點資料（各檔買賣超前 15 名分點）晚上才齊，每個交易日 22:00 後由 AI 整理：成績好的分點買了什麼、隔日沖大買（隔天可能賣壓）、大額或突然大買、這週籌碼換手。數字都是程式算的，AI 只負責寫成白話；不構成買賣建議。想收到通知，到「提醒」建立「分點晚報」並開啟背景推播。</Help>
        </div>
        <div className="px-4 pb-4 text-[13.5px] leading-relaxed">
          {rep && !rep.error ? (
            <>
              <div className="font-semibold text-[15px] mb-1.5"><Highlight text={rep.headline} /></div>
              <ul className="list-disc pl-5 space-y-0.5">{rep.points.map((p, i) => <li key={i}><Highlight text={p} /></li>)}</ul>
              {rep.watch && <div className="mt-2 text-text-2"><span className="text-[var(--gold-2)]">明日留意</span>　<Highlight text={rep.watch} /></div>}
              <div className="mt-2"><Link href="/brokers?tab=score" className="text-[13px] text-[var(--gold)]">看分點成績單 →</Link></div>
            </>
          ) : <div className="sub py-2">{rep?.error ?? "載入中…"}（每個交易日 22:00 後更新）</div>}
        </div>
      </div>
      <div className="grid"><WeeklyReview /></div>
      </div>
    ) },
    gainers: { span: "md:col-span-6 lg:col-span-3", node: <Rank title="漲幅排行" rows={gainers.map((r) => ({ c: r.c, n: r.n, p: r, v: <span className={cls(r.pct)}>{pct(r.pct)}</span> }))} /> },
    losers: { span: "md:col-span-6 lg:col-span-3", node: <Rank title="跌幅排行" rows={losers.map((r) => ({ c: r.c, n: r.n, p: r, v: <span className={cls(r.pct)}>{pct(r.pct)}</span> }))} /> },
    value: { span: "md:col-span-6 lg:col-span-3", node: <Rank title="成交值排行(億)" rows={value.map((r) => ({ c: r.c, n: r.n, p: r, v: r.value.toFixed(1) }))} /> },
    foreign: { span: "md:col-span-6 lg:col-span-3", node: <Rank title="外資買超(張)" sub={ch ? md(ch.date) : undefined} rows={(ch?.rank.f.buy ?? []).slice(0, 30).map((r) => ({ c: r.c, n: r.n, p: byCode.get(r.c), v: <span className="up">+{num(r.lots)}</span> }))} /> },
    signals: { span: "md:col-span-12 lg:col-span-8", node: (
      <div className="card">
        <div className="card-h">強勢訊號 <Link href="/screener" className="text-[13px] text-[var(--gold)]">開啟選股器</Link></div>
        <div className="scroll-y max-h-[240px] px-2 pb-2">
          <table className="tbl">
            <thead><tr><th>股票</th><th className="!text-left">符合的訊號</th><th>股價</th><th>漲跌幅</th><th><Term tip={RVOL_HELP} align="right">RVOL</Term></th></tr></thead>
            <tbody>
              {signals.map(({ s, tags }) => (
                <tr key={s.c} className="click" onClick={() => router.push(`/stock/${s.c}`)}>
                  <td><span className="mono text-text-2 mr-2">{s.c}</span>{s.n}</td>
                  <td className="!text-left"><span className="flex gap-1 flex-wrap">{tags.map((t) => { const chip = <span key={t} className={`chip ${t.includes("漲停") ? "!bg-[#3a1518] !text-[var(--up)]" : ""}`}>{t}</span>; const h = tagHelp(t); return h ? <Term key={t} tip={h} plain>{chip}</Term> : chip; })}</span></td>
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
    ) },
    events: { span: "md:col-span-12 lg:col-span-4", node: (
      <div className="card">
        <div className="card-h">盤中動態 <Link href="/alerts" className="text-[13px] text-[var(--gold)]">提醒設定</Link></div>
        <div className="scroll-y max-h-[240px] px-2 pb-2">
          {(ev?.today ? ev.events : []).map((e, i) => (
            <Link key={i} href={`/stock/${e.c}`} className="flex gap-3 px-2 py-1.5 rounded-lg hover:bg-panel-2 text-[13px]">
              <span className="mono sub">{e.t}</span>
              <span className={e.k === "lockUp" ? "up" : e.k === "lockDn" ? "down" : e.k === "rvol" ? "text-[var(--gold-2)]" : ""}>{e.msg}</span>
            </Link>
          ))}
          {!(ev?.today && ev.events.length) && <div className="sub px-2 py-6 leading-relaxed">盤中每 30 秒比對一次：漲跌停鎖住／打開、同時段量能爆增，會依時間列在這裡。</div>}
        </div>
      </div>
    ) },
  };

  return <DragGrid panels={panels} storageKey="namba.home.order" />;
}

function Rank({ title, rows, sub }: { title: string; rows: { c: string; n: string; p?: ScanRow; v: React.ReactNode }[]; sub?: string }) {
  return (
    <div className="card flex flex-col min-h-0">
      <div className="card-h !pt-3 !pb-1.5">{title}{sub && <span className="sub mr-auto">{sub}</span>}</div>
      {/* 一次顯示 5 檔，其餘用滾輪 */}
      <div className="scroll-y max-h-[150px] px-2 pb-2">
        {rows.map((r) => (
          <Link key={r.c} href={`/stock/${r.c}`} className="flex items-center gap-1.5 h-[30px] px-1 text-[12.5px] border-b border-line/60 last:border-0 hover:bg-panel-2">
            <span className="mono text-text-2 w-8 shrink-0">{r.c}</span><span className="flex-1 min-w-[3em] max-w-[6em] truncate" title={r.n}>{r.n}</span>
            {r.p && <span className={`mono min-w-[2.6rem] text-right shrink-0 ${cls(r.p.chg)}`}>{price(r.p.price)}</span>}
            <span className="mono min-w-[3.6rem] text-right whitespace-nowrap shrink-0">{r.v}</span>
          </Link>
        ))}
        {!rows.length && <div className="sub px-2 py-6 text-center loading">載入中…</div>}
      </div>
    </div>
  );
}

/** 股價在上、漲跌幅在下（自選股列用） */
function PriceCell({ r }: { r: { chg: number; pct: number; price: number } }) {
  return (
    <span className="w-[4.75rem] shrink-0 text-right leading-tight">
      <span className={`block mono ${cls(r.chg)}`}>{price(r.price)}</span>
      <span className={`block mono text-[11px] ${cls(r.pct)}`}>{pct(r.pct)}</span>
    </span>
  );
}

/** 手機寬度（窄於 640px）：首頁大盤圖改矮一點 */
const PHONE_MQ = "(max-width: 639px)";
function usePhone() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(PHONE_MQ); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(PHONE_MQ).matches,
    () => false,
  );
}
