"use client";
// 個股籌碼：法人近 5 日、外資持股與信用交易、大戶持股／當沖／借券、主力分點
import { useState } from "react";
import { usePoll } from "./hooks";
import { cls, num } from "./fmt";
import Spark from "./Spark";
import StockPicker, { NAME } from "./StockPicker";

type C = {
  error?: string; date: string; days: [string, number, number, number][]; fDays: number; tDays: number;
  qfii: { pct: number; chg: number | null } | null;
  margin: { bal: number; chg: number; use: number | null; short: number; shortChg: number; ratio: number } | null;
  dayTrade: number | null; sbl: { bal: number; chg: number | null } | null;
  tdcc: { date: string; big: number; holders: number; bigChg: number | null; holdersChg: number | null; big400?: number } | null;
  holders?: [string, number, number, number][];
};
type B = { error?: string; from: string; to: string; buy: { n: string; lots: number; pct: number }[]; sell: { n: string; lots: number; pct: number }[]; buySum: number; sellSum: number; conc: number | null };
const sg = (v: number) => `${v > 0 ? "+" : ""}${num(v)}`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 標題列用的股票選單：顯示「2330 台積電 ⌄」，點開可以搜尋換股（跟里長伯一樣） */
export function StockSelect({ code, onPick }: { code: string; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setTimeout(() => setOpen(false), 200); }}>
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-lg bg-panel-2 border border-line px-2.5 py-1 text-[13px]">
        <span className="mono text-text-2">{code}</span><b className="font-semibold text-text">{NAME.get(code) ?? ""}</b><span className="text-text-2 text-[11px]">▾</span>
      </button>
      {open && <div className="absolute left-0 top-full mt-1 z-30 w-72"><StockPicker autoFocus onPick={(c) => { onPick(c); setOpen(false); }} /></div>}
    </span>
  );
}

function useChips(code: string) {
  return usePoll<C>(`/api/chips?code=${code}`).data;
}
const chgText = (v: number | null | undefined, unit = "") => (v == null ? "" : `${v > 0 ? "+" : ""}${num(v)}${unit}`);
const pctChg = (v: number | null | undefined) => (v == null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);

/** 一列：左標籤、右數值＋增減 */
function KV({ l, v, chg, c = 0 }: { l: React.ReactNode; v: string; chg?: string; c?: number }) {
  return (
    <div className="flex items-baseline py-1.5 border-t border-[#1c1f24] text-[13px]">
      <span className="text-text-2">{l}</span>
      <span className="ml-auto mono">{v}</span>
      {chg ? <span className={`mono ml-2 text-[12px] ${cls(c)}`}>{chg}</span> : null}
    </div>
  );
}
/** 數值下面一條比例條 */
function Bar({ pct, color = "var(--gold)" }: { pct: number; color?: string }) {
  return <div className="h-1.5 rounded bg-panel-2 mt-1 mb-2"><div className="h-full rounded" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} /></div>;
}

/** 個股籌碼：左邊法人近 5 日買賣超，右邊外資持股與信用交易（版面照里長伯） */
export function ChipsInst({ code }: { code: string }) {
  const c = useChips(code);
  if (!c) return <div className="sub px-4 pb-4 loading">籌碼載入中…</div>;
  if (c.error) return <div className="sub px-4 pb-4">{c.error}</div>;
  const last5 = c.days.slice(-5).reverse();
  const sum = [1, 2, 3].map((k) => last5.reduce((a, d) => a + (d[k] as number), 0));
  return (
    <div className="px-4 pb-4 grid gap-5 md:grid-cols-2">
      <div>
        <div className="flex items-baseline mb-1"><b className="text-[13px]">法人近 5 日買賣超</b><span className="sub ml-auto">單位：張</span></div>
        <table className="tbl text-[13px]">
          <thead><tr><th>日期</th><th>外資</th><th>投信</th><th>自營商</th></tr></thead>
          <tbody>
            {last5.map((d) => <tr key={d[0]}><td className="mono text-text-2">{md(d[0])}</td>{[1, 2, 3].map((k) => <td key={k} className={`mono ${cls(d[k] as number)}`}>{sg(d[k] as number)}</td>)}</tr>)}
            <tr><td className="text-text-2">合計</td>{sum.map((v, k) => <td key={k} className={`mono font-semibold ${cls(v)}`}>{sg(v)}</td>)}</tr>
          </tbody>
        </table>
        <div className="sub mt-1">外資{c.fDays > 0 ? `連買 ${c.fDays} 日` : c.fDays < 0 ? `連賣 ${-c.fDays} 日` : "—"} · 投信{c.tDays > 0 ? `連買 ${c.tDays} 日` : c.tDays < 0 ? `連賣 ${-c.tDays} 日` : "—"}</div>
      </div>
      <div>
        <b className="text-[13px]">外資持股與信用交易</b>
        <div className="flex items-baseline mt-2 text-[13px]"><span className="text-text-2">外資持股比例 · {md(c.date)}</span><span className="ml-auto mono">{c.qfii ? `${c.qfii.pct.toFixed(2)}%` : "上櫃股不提供"}</span>{c.qfii?.chg != null && <span className={`mono ml-2 text-[12px] ${cls(c.qfii.chg)}`}>{pctChg(c.qfii.chg)}</span>}</div>
        {c.qfii && <Bar pct={c.qfii.pct} />}
        <KV l="融資餘額" v={c.margin ? `${num(c.margin.bal)} 張` : "—"} chg={chgText(c.margin?.chg)} c={c.margin?.chg ?? 0} />
        <KV l="融資使用率" v={c.margin?.use != null ? `${c.margin.use.toFixed(2)}%` : "—"} />
        <KV l="融券餘額" v={c.margin ? `${num(c.margin.short)} 張` : "—"} chg={chgText(c.margin?.shortChg)} c={c.margin?.shortChg ?? 0} />
        <KV l="券資比" v={c.margin ? `${c.margin.ratio.toFixed(2)}%` : "—"} />
        <div className="sub mt-2 leading-relaxed">融資券為 {md(c.date)} 餘額，增減是跟前一個交易日比。</div>
      </div>
    </div>
  );
}

/** 大戶持股、當沖與借券 */
export function ChipsBig({ code }: { code: string }) {
  const c = useChips(code);
  if (!c) return <div className="sub px-4 pb-4 loading">籌碼載入中…</div>;
  if (c.error) return <div className="sub px-4 pb-4">{c.error}</div>;
  return (
    <div className="px-4 pb-4 grid gap-5 md:grid-cols-2">
      <div>
        <div className="flex items-baseline text-[13px]"><span className="text-text-2">千張大戶持股比例</span><span className="ml-auto mono">{c.tdcc ? `${c.tdcc.big.toFixed(2)}%` : "—"}</span>{c.tdcc?.bigChg != null && <span className={`mono ml-2 text-[12px] ${cls(c.tdcc.bigChg)}`}>{pctChg(c.tdcc.bigChg)}</span>}</div>
        {c.tdcc && <Bar pct={c.tdcc.big} />}
        <KV l="股東人數" v={c.tdcc ? `${num(c.tdcc.holders)} 人` : "—"} chg={chgText(c.tdcc?.holdersChg)} c={-(c.tdcc?.holdersChg ?? 0)} />
        <div className="sub mt-2 leading-relaxed">集保每週公布{c.tdcc ? ` · 資料日期 ${md(c.tdcc.date)}` : ""} · 增減是跟前一週比；大戶增加、股東人數減少代表籌碼集中。</div>
        {c.holders && c.holders.length > 2 && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="min-w-0 overflow-hidden"><div className="sub">大戶 · 近 {c.holders.length} 週</div><Spark data={c.holders.map((x) => x[1])} w={110} h={34} color="var(--gold)" /></div>
            <div className="min-w-0 overflow-hidden"><div className="sub">股東人數 · 近 {c.holders.length} 週</div><Spark data={c.holders.map((x) => x[2])} w={110} h={34} color="#5aa9ff" /></div>
          </div>
        )}
      </div>
      <div>
        <KV l={`當沖比 · ${md(c.date)}`} v={c.dayTrade != null ? `${c.dayTrade.toFixed(2)}%` : "—"} />
        <KV l={`借券賣出餘額 · ${md(c.date)}`} v={c.sbl ? `${num(c.sbl.bal)} 張` : "上櫃股不提供"} chg={chgText(c.sbl?.chg)} c={-(c.sbl?.chg ?? 0)} />
        <div className="sub mt-2 leading-relaxed">當沖比＝當沖成交量 ÷ 當日成交量；借券賣出餘額後面是日增減（張）。</div>
      </div>
    </div>
  );
}

/** 個股頁用：個股籌碼＋大戶持股（上下排） */
export function ChipsSummary({ code }: { code: string }) {
  return <div className="grid gap-2"><ChipsInst code={code} /><ChipsBig code={code} /></div>;
}

function Stat({ l, v, s, sc = 0, vc }: { l: string; v: string; s?: string; sc?: number; vc?: number }) {
  return <div className="rounded-lg bg-panel-2 px-3 py-2"><div className="sub">{l}</div><div className={`mono text-[15px] ${vc != null ? `font-semibold ${cls(vc)}` : ""}`}>{v}</div>{s && <div className={`mono text-[12px] ${s.includes("不提供") || s.includes("公布") ? "sub" : cls(sc)}`}>{s}</div>}</div>;
}

/** 主力分點；head 有給就把標題和「近1日／近5日」放在同一列（籌碼頁），沒給就只放切換（個股頁） */
export function Branches({ code, head }: { code: string; head?: React.ReactNode }) {
  const [days, setDays] = useState<1 | 5>(1);
  const { data: b } = usePoll<B>(`/api/branch?code=${code}&days=${days}`);
  const seg = <div className="seg"><button className={days === 1 ? "on" : ""} onClick={() => setDays(1)}>近 1 日</button><button className={days === 5 ? "on" : ""} onClick={() => setDays(5)}>近 5 日</button></div>;
  const max = b && !b.error ? Math.max(1, ...[...b.buy, ...b.sell].map((y) => Math.abs(y.lots))) : 1;
  return (
    <>
    {head ? <div className="card-h" style={{ justifyContent: "flex-start" }}>{head}<span className="ml-auto">{seg}</span></div> : null}
    <div className="px-4 pb-4">
      {!head && <div className="flex items-center gap-2 mb-3">{seg}</div>}
      {!b ? <div className="sub loading">讀取券商分點…</div> : b.error ? <div className="sub">{b.error}</div> : (
        <>
          <div className="grid grid-cols-3 gap-2 text-[13px] mb-3">
            <Stat l="買超前 15 合計" v={`${sg(b.buySum)} 張`} vc={b.buySum} />
            <Stat l="賣超前 15 合計" v={`${sg(b.sellSum)} 張`} vc={b.sellSum} />
            <Stat l="籌碼集中度" v={b.conc != null ? `${b.conc > 0 ? "+" : ""}${b.conc.toFixed(2)}%` : "—"} vc={b.conc ?? 0} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[{ t: "買超券商", l: b.buy, c: "up" }, { t: "賣超券商", l: b.sell, c: "down" }].map((x) => (
              <table key={x.t} className="tbl text-[13px]">
                <thead><tr><th className={x.c}>{x.t}</th><th>{x.c === "up" ? "買超" : "賣超"} (張)</th><th>佔成交</th></tr></thead>
                <tbody>{x.l.map((y) => (
                  <tr key={y.n}>
                    {/* 券商名稱底下一條依張數比例的底色（跟里長伯一樣） */}
                    <td style={{ background: `linear-gradient(90deg, ${x.c === "up" ? "rgba(242,85,79,.22)" : "rgba(34,181,115,.22)"} ${(Math.abs(y.lots) / max) * 100}%, transparent 0)` }}>{y.n}</td>
                    <td className={`mono ${x.c}`}>{sg(y.lots)}</td><td className="mono">{y.pct.toFixed(2)}%</td>
                  </tr>
                ))}</tbody>
              </table>
            ))}
          </div>
          <div className="sub mt-2 leading-relaxed">統計區間 {md(b.from)}{b.from !== b.to ? ` – ${md(b.to)}` : ""}（近 {days} 個交易日）· 資料來源：券商公開資訊頁，非正式 API<br />籌碼集中度＝（前 15 名買超 − 前 15 名賣超）÷ 區間成交量；正值代表籌碼往少數券商集中。</div>
        </>
      )}
    </div>
    </>
  );
}
