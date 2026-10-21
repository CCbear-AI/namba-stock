"use client";
// 個股籌碼：法人近 5 日、外資持股與信用交易、大戶持股／當沖／借券、主力分點
import { useState } from "react";
import { usePoll } from "./hooks";
import { cls, num } from "./fmt";

type C = {
  error?: string; date: string; days: [string, number, number, number][]; fDays: number; tDays: number;
  qfii: { pct: number; chg: number | null } | null;
  margin: { bal: number; chg: number; use: number | null; short: number; shortChg: number; ratio: number } | null;
  dayTrade: number | null; sbl: { bal: number; chg: number | null } | null;
  tdcc: { date: string; big: number; holders: number; bigChg: number | null; holdersChg: number | null } | null;
};
type B = { error?: string; from: string; to: string; buy: { n: string; lots: number; pct: number }[]; sell: { n: string; lots: number; pct: number }[]; buySum: number; sellSum: number; conc: number | null };
const sg = (v: number) => `${v > 0 ? "+" : ""}${num(v)}`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function ChipsSummary({ code }: { code: string }) {
  const { data: c } = usePoll<C>(`/api/chips?code=${code}`);
  if (!c) return <div className="sub px-4 pb-4 loading">籌碼載入中…</div>;
  if (c.error) return <div className="sub px-4 pb-4">{c.error}</div>;
  const last5 = c.days.slice(-5).reverse();
  const sum = [1, 2, 3].map((k) => last5.reduce((a, d) => a + (d[k] as number), 0));
  return (
    <div className="px-4 pb-4 grid gap-4">
      <div>
        <div className="sub mb-1">法人買賣超 · 近 5 日 <span className="ml-1">單位：張 · 至 {md(c.date)}</span></div>
        <table className="tbl text-[13px]">
          <thead><tr><th>日期</th><th>外資</th><th>投信</th><th>自營商</th></tr></thead>
          <tbody>
            {last5.map((d) => <tr key={d[0]}><td className="mono text-text-2">{md(d[0])}</td>{[1, 2, 3].map((k) => <td key={k} className={`mono ${cls(d[k] as number)}`}>{sg(d[k] as number)}</td>)}</tr>)}
            <tr><td className="text-text-2">合計</td>{sum.map((v, k) => <td key={k} className={`mono font-semibold ${cls(v)}`}>{sg(v)}</td>)}</tr>
          </tbody>
        </table>
        <div className="sub mt-1">外資{c.fDays > 0 ? `連買 ${c.fDays} 日` : c.fDays < 0 ? `連賣 ${-c.fDays} 日` : "—"} · 投信{c.tDays > 0 ? `連買 ${c.tDays} 日` : c.tDays < 0 ? `連賣 ${-c.tDays} 日` : "—"}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <Stat l={`外資持股比例 · ${md(c.date)}`} v={c.qfii ? `${c.qfii.pct.toFixed(2)}%` : "—"} s={c.qfii?.chg != null ? `${c.qfii.chg >= 0 ? "+" : ""}${c.qfii.chg.toFixed(2)} 個百分點` : "上櫃股不提供"} sc={c.qfii?.chg ?? 0} />
        <Stat l="融資餘額" v={c.margin ? `${num(c.margin.bal)} 張` : "—"} s={c.margin ? sg(c.margin.chg) : ""} sc={c.margin?.chg ?? 0} />
        <Stat l="融資使用率" v={c.margin?.use != null ? `${c.margin.use.toFixed(2)}%` : "—"} />
        <Stat l="融券餘額" v={c.margin ? `${num(c.margin.short)} 張` : "—"} s={c.margin ? sg(c.margin.shortChg) : ""} sc={c.margin?.shortChg ?? 0} />
        <Stat l="券資比" v={c.margin ? `${c.margin.ratio.toFixed(2)}%` : "—"} />
        <Stat l={`當沖比 · ${md(c.date)}`} v={c.dayTrade != null ? `${c.dayTrade.toFixed(2)}%` : "—"} />
        <Stat l={c.tdcc ? `千張大戶持股 · ${md(c.tdcc.date)}` : "千張大戶持股"} v={c.tdcc ? `${c.tdcc.big.toFixed(2)}%` : "—"} s={c.tdcc?.bigChg != null ? `${c.tdcc.bigChg >= 0 ? "+" : ""}${c.tdcc.bigChg.toFixed(2)} 個百分點` : "集保每週公布"} sc={c.tdcc?.bigChg ?? 0} />
        <Stat l="股東人數" v={c.tdcc ? `${num(c.tdcc.holders)} 人` : "—"} s={c.tdcc?.holdersChg != null ? sg(c.tdcc.holdersChg) : ""} sc={-(c.tdcc?.holdersChg ?? 0)} />
        <Stat l={`借券賣出餘額 · ${md(c.date)}`} v={c.sbl ? `${num(c.sbl.bal)} 張` : "—"} s={c.sbl?.chg != null ? sg(c.sbl.chg) : "上櫃股不提供"} sc={-(c.sbl?.chg ?? 0)} />
      </div>
      <div className="sub leading-relaxed">融資券為 {md(c.date)} 餘額，增減是跟前一個交易日比。當沖比＝當沖成交量 ÷ 當日成交量。千張大戶、股東人數為集保每週資料，增減是跟前一週比。</div>
    </div>
  );
}

function Stat({ l, v, s, sc = 0 }: { l: string; v: string; s?: string; sc?: number }) {
  return <div className="rounded-lg bg-panel-2 px-3 py-2"><div className="sub">{l}</div><div className="mono text-[15px]">{v}</div>{s && <div className={`mono text-[12px] ${s.includes("不提供") || s.includes("公布") ? "sub" : cls(sc)}`}>{s}</div>}</div>;
}

export function Branches({ code }: { code: string }) {
  const [days, setDays] = useState<1 | 5>(1);
  const { data: b } = usePoll<B>(`/api/branch?code=${code}&days=${days}`);
  return (
    <div className="px-4 pb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="seg"><button className={days === 1 ? "on" : ""} onClick={() => setDays(1)}>近 1 日</button><button className={days === 5 ? "on" : ""} onClick={() => setDays(5)}>近 5 日</button></div>
      </div>
      {!b ? <div className="sub loading">讀取券商分點…</div> : b.error ? <div className="sub">{b.error}</div> : (
        <>
          <div className="grid grid-cols-3 gap-2 text-[13px] mb-3">
            <Stat l="買超前 15 合計" v={`${sg(b.buySum)} 張`} sc={1} />
            <Stat l="賣超前 15 合計" v={`${sg(b.sellSum)} 張`} />
            <Stat l="籌碼集中度" v={b.conc != null ? `${b.conc.toFixed(2)}%` : "—"} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[{ t: "買超券商", l: b.buy, c: "up" }, { t: "賣超券商", l: b.sell, c: "down" }].map((x) => (
              <table key={x.t} className="tbl text-[13px]">
                <thead><tr><th>{x.t}</th><th>{x.c === "up" ? "買超" : "賣超"} (張)</th><th>佔成交</th></tr></thead>
                <tbody>{x.l.map((y) => <tr key={y.n}><td>{y.n}</td><td className={`mono ${x.c}`}>{sg(y.lots)}</td><td className="mono">{y.pct.toFixed(2)}%</td></tr>)}</tbody>
              </table>
            ))}
          </div>
          <div className="sub mt-2 leading-relaxed">統計區間 {md(b.from)}{b.from !== b.to ? ` – ${md(b.to)}` : ""}（近 {days} 個交易日）· 資料來源：券商公開資訊頁，非正式 API<br />籌碼集中度＝（前 15 名買超 − 前 15 名賣超）÷ 區間成交量；正值代表籌碼往少數券商集中。</div>
        </>
      )}
    </div>
  );
}
