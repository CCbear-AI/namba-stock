"use client";
// 自選股收盤報告：程式算的重點表＋學校 AI 寫的幾句重點（每組股票每個交易日寫一次）
import Link from "next/link";
import { useEffect, useState } from "react";
import Help from "./Help";
import { cls, pct } from "./fmt";
import type { WlReport as R, WlRow } from "@/lib/wlreport";

type D = R & { error?: string; ai?: { headline: string; points: string[] }; aiError?: string; pending?: boolean };
const lots = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString()}`;

/** 每檔值得一提的標籤（沒有就不列） */
function tags(r: WlRow) {
  const t: { s: string; c?: string }[] = [];
  if (r.rv != null && r.rv >= 1.8) t.push({ s: `量 ${r.rv} 倍`, c: "text-[var(--gold-2)]" });
  if (r.f != null && r.t != null && Math.abs(r.f + r.t) >= 500) t.push({ s: `法人 ${lots(r.f + r.t)} 張`, c: cls(r.f + r.t) });
  if (r.mg != null && Math.abs(r.mg) >= 300) t.push({ s: `融資 ${lots(r.mg)}` });
  if (r.top && r.top.lots >= 300) t.push({ s: `${r.top.b}（${r.top.cls}）買 ${r.top.lots.toLocaleString()} 張` });
  if (r.dt) t.push({ s: `隔日沖大買 ${r.dt.pct.toFixed(0)}%`, c: "text-[var(--gold-2)]" });
  if (r.dump) t.push({ s: `隔日沖倒 ${r.dump.toFixed(0)}%` });
  if (r.ma === "below") t.push({ s: "跌破月季線", c: "text-down" });
  return t;
}

export default function WlReport({ codes, name }: { codes: string[]; name: string }) {
  const sig = `${name}|${codes.join(",")}`;
  const [st, setSt] = useState<{ sig: string; d: D } | null>(null);
  const [open, setOpen] = useState(false);
  const d = st?.sig === sig ? st.d : null;
  useEffect(() => {
    if (!codes.length) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const setD = (v: D) => setSt({ sig, d: v });
    const load = async (n: number) => {
      try {
        const j: D = await (await fetch(`/api/wlreport?codes=${codes.join(",")}&name=${encodeURIComponent(name)}`, { cache: "no-store" })).json();
        if (stop) return;
        setD(n >= 16 && j.pending ? { ...j, pending: false, aiError: "學校 AI 太久沒回應" } : j);
        if (j.pending && n < 16) timer = setTimeout(() => load(n + 1), 15_000);
      } catch (e) {
        if (!stop) setD({ error: (e as Error).message } as D);
      }
    };
    load(0);
    return () => { stop = true; clearTimeout(timer); };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!codes.length) return null;
  const rows = d?.rows ? [...d.rows].sort((a, b) => b.pct - a.pct) : [];
  const marked = rows.filter((r) => tags(r).length);
  return (
    <div className="card">
      <div className="card-h">
        <span className="inline-flex items-center">收盤報告<Help>用盤後資料整理這個群組當天的重點：漲跌、量能、法人、融資、主力分點、隔日沖、重大訊息。數字由程式計算；上面幾句重點由學校 AI 根據這些數字撰寫，每組股票每個交易日寫一次。分點資料晚上 22:00 後才進來，進來後重點會重寫。不是買賣建議。</Help></span>
        {d?.date && <span className="sub mono">{d.date.slice(5).replace("-", "/")} 收盤{d.brokers ? "" : " · 分點晚上才有"}</span>}
      </div>
      {!d ? <div className="sub px-4 pb-4 loading">整理中…</div> : d.error ? <div className="sub px-4 pb-4">{d.error}</div> : (
        <div className="px-4 pb-4 grid gap-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
            <span>漲 <b className="text-up mono">{d.up}</b></span>
            <span>跌 <b className="text-down mono">{d.down}</b></span>
            <span>平均 <b className={`mono ${cls(d.avg)}`}>{pct(d.avg)}</b></span>
            {d.news.length > 0 && <span>重大訊息 <b className="mono">{d.news.length}</b> 則</span>}
          </div>
          <div className="rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-[14px]">
            {d.ai ? (
              <>
                <div className="font-semibold mb-1">🤖 {d.ai.headline}</div>
                <ul className="list-disc pl-5 grid gap-0.5">{d.ai.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </>
            ) : d.pending ? <span className="loading text-[13px]">AI 重點撰寫中（學校主機較慢，約 1～2 分鐘）…</span>
              : <span className="sub text-[12px]">AI 重點暫時無法使用（{d.aiError}）</span>}
          </div>
          {(marked.length > 0 || d.news.length > 0) && (
            <button className="text-[13px] text-[var(--gold)] text-left" onClick={() => setOpen(!open)}>{open ? "▾ 收起明細" : `▸ 看明細（${marked.length} 檔有狀況${d.news.length ? `、${d.news.length} 則重大訊息` : ""}）`}</button>
          )}
          {open && (
            <div className="grid gap-3">
              {marked.length > 0 && (
                <div className="grid gap-1 text-[13px]">
                  {marked.map((r) => (
                    <Link key={r.c} href={`/stock/${r.c}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded px-2 py-1 hover:bg-panel-2">
                      <span className="w-[7em] shrink-0 truncate"><span className="mono text-text-2 mr-1">{r.c}</span>{r.n}</span>
                      <span className={`mono w-[4.5em] shrink-0 text-right ${cls(r.pct)}`}>{pct(r.pct)}</span>
                      {tags(r).map((t, i) => <span key={i} className={`text-[12px] ${t.c ?? "text-text-2"}`}>{t.s}</span>)}
                    </Link>
                  ))}
                </div>
              )}
              {d.news.length > 0 && (
                <div className="grid gap-1 text-[13px] border-t border-line pt-2">
                  {d.news.map((x, i) => (
                    <Link key={i} href={`/stock/${x.c}`} className="flex items-baseline gap-2 rounded px-2 py-1 hover:bg-panel-2" title={x.title}>
                      <span className="mono text-text-2 shrink-0">{x.d.slice(5).replace("-", "/")}</span>
                      <span className="shrink-0 w-[5em] truncate">{x.n}</span>
                      {x.tag && <span className={`chip shrink-0 !py-0 text-[11px] ${x.imp === 3 ? "!bg-[#3a1a1e] !text-[var(--up)]" : ""}`}>{x.tag}</span>}
                      <span className="min-w-0">{x.sum || x.title}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
