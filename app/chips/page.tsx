"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePoll } from "@/components/hooks";
import { cls, num } from "@/components/fmt";
import ExportBtn from "@/components/ExportBtn";
import StockPicker, { NAME } from "@/components/StockPicker";
import { ChipsSummary, Branches } from "@/components/StockChips";

type RankRow = { c: string; n: string; lots: number; amt: number; streak: number };
type M = {
  error?: string; date: string;
  market: { f: number; t: number; d: number; dSelf: number; dHedge: number; total: number; fStreak: number; tStreak: number; sum20: number; marginAmt: number; marginChg: number | null; shortLots: number; shortChg: number | null };
  series: { date: string; f: number; t: number; d: number }[];
  futures: { date: string; tx: [number, number, number]; top10: number; pcr: number; retail: number; fOpt: [number, number]; prev: { tx: [number, number, number]; top10: number; pcr: number; retail: number } | null } | null;
  rank: Record<"f" | "t" | "d", { buy: RankRow[]; sell: RankRow[] }>;
};
const yi = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
const sg = (v: number) => `${v > 0 ? "+" : ""}${num(v)}`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const streakText = (s: number) => (s > 0 ? `連 ${s} 日買超` : s < 0 ? `連 ${-s} 日賣超` : "");
const WHO = { f: "外資", t: "投信", d: "自營商" } as const;

export default function Page() {
  return <Suspense><Chips /></Suspense>;
}

function Chips() {
  const sp = useSearchParams();
  const { data } = usePoll<M>("/api/chips");
  const [code, setCode] = useState(sp.get("code") ?? "2330");
  if (!data) return <div className="sub py-20 text-center loading">籌碼載入中…</div>;
  if (data.error) return <div className="sub py-20 text-center">{data.error}</div>;
  const m = data.market;
  return (
    <div className="grid gap-4" id="chips-area">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold">籌碼分析</h1><span className="sub">大盤法人動向 · 資料日期 {data.date.replace(/-/g, "/")}（盤後公布）</span>
        <span className="ml-auto"><ExportBtn name="籌碼分析" target={() => document.getElementById("chips-area")} /></span>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Card l="外資及陸資" v={`${yi(m.f)} 億`} c={m.f} s={streakText(m.fStreak)} />
        <Card l="投信" v={`${yi(m.t)} 億`} c={m.t} s={streakText(m.tStreak)} />
        <Card l="自營商" v={`${yi(m.d)} 億`} c={m.d} s={`自行買賣 ${yi(m.dSelf)} · 避險 ${yi(m.dHedge)}`} />
        <Card l="三大法人合計" v={`${yi(m.total)} 億`} c={m.total} s={`近 20 日累計 ${yi(m.sum20)} 億`} />
        <Card l="融資餘額" v={`${num(m.marginAmt, 1)} 億`} s={m.marginChg != null ? `${yi(m.marginChg)} 億` : ""} sc={m.marginChg ?? 0} />
        <Card l="融券餘額" v={`${(m.shortLots / 1e4).toFixed(1)} 萬張`} s={m.shortChg != null ? `${sg(m.shortChg)} 張` : ""} sc={m.shortChg ?? 0} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        <InstChart series={data.series} />
        {data.futures && <Futures f={data.futures} />}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Rank title="買超排行" rank={data.rank} side="buy" date={data.date} />
        <Rank title="賣超排行" rank={data.rank} side="sell" date={data.date} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-h">個股籌碼 <span className="mono">{code} {NAME.get(code)}</span><Link href={`/stock/${code}`} className="sub hover:text-text">看個股 ›</Link></div>
          <div className="px-4 pb-3"><StockPicker onPick={setCode} /></div>
          <ChipsSummary code={code} />
        </div>
        <div className="card">
          <div className="card-h">主力分點 <span className="mono">{code} {NAME.get(code)}</span></div>
          <Branches code={code} />
        </div>
      </div>
    </div>
  );
}

function Card({ l, v, c = 0, s, sc }: { l: string; v: string; c?: number; s?: string; sc?: number }) {
  return (
    <div className="card px-4 py-3">
      <div className="sub">{l}</div>
      <div className={`mono text-2xl font-semibold mt-1 ${cls(c)}`}>{v}</div>
      {s && <div className={`text-[12px] mt-1 ${sc != null ? cls(sc) : "text-text-2"}`}>{s}</div>}
    </div>
  );
}

function InstChart({ series }: { series: M["series"] }) {
  const [k, setK] = useState<"sum" | "f" | "t" | "d">("sum");
  const [hover, setHover] = useState<number | null>(null);
  const v = (x: M["series"][number]) => (k === "sum" ? x.f + x.t + x.d : x[k]);
  const max = Math.max(1, ...series.map((x) => Math.abs(v(x))));
  const cur = series[hover ?? series.length - 1];
  const W = 100 / series.length;
  return (
    <div className="card">
      <div className="card-h">法人買賣超 · 近 {series.length} 個交易日
        <div className="seg">{([["sum", "合計"], ["f", "外資"], ["t", "投信"], ["d", "自營商"]] as const).map(([id, l]) => <button key={id} className={k === id ? "on" : ""} onClick={() => setK(id)}>{l}</button>)}</div>
      </div>
      {cur && <div className="px-4 text-[13px] mono flex flex-wrap gap-3">
        <span className="text-text-2">{md(cur.date)}{hover == null ? "（最新）" : ""}</span>
        <span>合計 <span className={cls(cur.f + cur.t + cur.d)}>{yi(cur.f + cur.t + cur.d)} 億</span></span>
        <span>外資 <span className={cls(cur.f)}>{yi(cur.f)}</span></span><span>投信 <span className={cls(cur.t)}>{yi(cur.t)}</span></span><span>自營商 <span className={cls(cur.d)}>{yi(cur.d)}</span></span>
      </div>}
      <div className="relative h-[260px] mx-4 my-3" onMouseLeave={() => setHover(null)}>
        <div className="absolute left-0 right-0 top-1/2 border-t border-line" />
        <span className="absolute left-0 top-0 sub mono">+{num(max)}</span><span className="absolute left-0 bottom-0 sub mono">-{num(max)}</span>
        {series.map((x, i) => {
          const val = v(x), h = (Math.abs(val) / max) * 50;
          return (
            <div key={x.date} className="absolute top-0 bottom-0" style={{ left: `${i * W}%`, width: `${W}%` }} onMouseEnter={() => setHover(i)}>
              <div className="absolute left-[15%] right-[15%]" style={{ top: val >= 0 ? `${50 - h}%` : "50%", height: `${h}%`, background: val >= 0 ? "var(--up)" : "var(--down)", opacity: hover == null || hover === i ? 1 : 0.5 }} />
            </div>
          );
        })}
      </div>
      <div className="px-4 pb-3 flex justify-between sub mono">{series.filter((_, i) => i % 4 === 0 || i === series.length - 1).map((x) => <span key={x.date}>{md(x.date)}</span>)}</div>
      <div className="px-4 pb-4 sub">單位：億元 · 紅色買超、綠色賣超 · 滑過長條看當日數值</div>
    </div>
  );
}

function Futures({ f }: { f: NonNullable<M["futures"]> }) {
  const d = (a: number, b?: number) => (b == null ? "" : sg(a - b));
  return (
    <div className="card">
      <div className="card-h">期貨與選擇權籌碼 <span className="sub">資料日期 {md(f.date)}</span></div>
      <div className="px-4 pb-4 text-[13px]">
        <table className="tbl"><thead><tr><th>台指期淨未平倉</th><th>口數</th><th>較前一日</th></tr></thead>
          <tbody>{(["外資", "投信", "自營商"] as const).map((w, k) => <tr key={w}><td>{w}</td><td className={`mono ${cls(f.tx[k])}`}>{sg(f.tx[k])} 口</td><td className={`mono ${cls(f.tx[k] - (f.prev?.tx[k] ?? f.tx[k]))}`}>{d(f.tx[k], f.prev?.tx[k])} 口</td></tr>)}</tbody>
        </table>
        <div className="sub my-2">淨未平倉為正是淨多單、為負是淨空單。</div>
        <Row l="前十大交易人淨部位" v={`${sg(f.top10)} 口`} c={f.top10} />
        <Row l="選擇權 Put/Call 未平倉比" v={`${f.pcr.toFixed(2)}%`} extra={f.prev ? `${(f.pcr - f.prev.pcr) >= 0 ? "+" : ""}${(f.pcr - f.prev.pcr).toFixed(2)}` : ""} />
        <div className="sub mb-2">Put/Call 比後面是跟前一日{f.prev ? `（${f.prev.pcr.toFixed(2)}%）` : ""}相比的增減。</div>
        <Row l="小台散戶多空比" v={`${f.retail >= 0 ? "+" : ""}${f.retail.toFixed(2)}%`} c={f.retail} extra={f.prev ? `較前一日 ${(f.retail - f.prev.retail) >= 0 ? "+" : ""}${(f.retail - f.prev.retail).toFixed(2)}` : ""} />
        <div className="sub mb-2">（散戶多單 − 散戶空單）÷ 小台全市場未平倉，散戶＝全市場扣掉三大法人。正值偏多、負值偏空。</div>
        <div className="mt-3 font-semibold">外資選擇權未平倉淨金額 <span className="sub">多方 − 空方</span></div>
        <Row l="買權（Call）" v={`${yi(f.fOpt[0])} 億`} c={f.fOpt[0]} />
        <Row l="賣權（Put）" v={`${yi(f.fOpt[1])} 億`} c={f.fOpt[1]} />
        <div className="sub">買權、賣權各自用多方未平倉金額減空方；正值是買進的部位較多，負值是賣出的較多。</div>
      </div>
    </div>
  );
}
function Row({ l, v, c = 0, extra }: { l: string; v: string; c?: number; extra?: string }) {
  return <div className="flex py-1.5 border-t border-[#1c1f24]"><span>{l}</span><span className={`ml-auto mono ${cls(c)}`}>{v}</span>{extra && <span className="mono sub ml-2">{extra}</span>}</div>;
}

function Rank({ title, rank, side, date }: { title: string; rank: M["rank"]; side: "buy" | "sell"; date: string }) {
  const [w, setW] = useState<"f" | "t" | "d">("f");
  const rows = rank[w][side];
  return (
    <div className="card">
      <div className="card-h">{title}<div className="seg">{(["f", "t", "d"] as const).map((x) => <button key={x} className={w === x ? "on" : ""} onClick={() => setW(x)}>{WHO[x]}</button>)}</div></div>
      <div className="px-4 sub">資料日期 {md(date)} · 前 50 名</div>
      <div className="scroll-y max-h-[460px] px-2 pb-2">
        <table className="tbl text-[13px]">
          <thead><tr><th>股票</th><th>{side === "buy" ? "買超" : "賣超"} (張)</th><th>金額 (億)</th><th>{side === "buy" ? "連買" : "連賣"}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.c}><td><Link href={`/stock/${r.c}`} className="hover:text-[var(--gold-2)]"><span className="mono text-text-2 mr-2">{r.c}</span>{r.n}</Link></td>
              <td className={`mono ${cls(r.lots)}`}>{sg(r.lots)}</td><td className="mono">{Math.abs(r.amt).toFixed(2)}</td><td className="mono">{Math.abs(r.streak)} 日</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
