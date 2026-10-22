"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import KChart from "@/components/KChart";
import ExportBtn from "@/components/ExportBtn";
import Distribution from "@/components/Distribution";
import Spark from "@/components/Spark";
import { usePoll, useScan } from "@/components/hooks";
import { cls, pct, price, num, hm } from "@/components/fmt";
import type { Market } from "@/lib/types";

type Orders = { bidLots: number; bidCnt: number; askLots: number; askCnt: number; vol: number; trades: number; value: number };
type T = {
  futures: { name: string; price: number; chg: number; pct: number; basis: number } | null;
  orders: { tse: Orders | null; otc: Orders | null }; ordersLine: [string, number, number][];
  contrib: { up: { c: string; n: string; pct: number; pt: number }[]; down: { c: string; n: string; pct: number; pt: number }[]; upSum: number; downSum: number };
  world: { s: string; n: string; g: string; price: number; prev: number; chg: number; pct: number; spark: number[] }[];
};
type Ch = { date: string; market: { f: number; t: number; d: number; total: number; marginAmt: number; marginChg: number | null; shortLots: number; shortChg: number | null }; futures: { date?: string; tx: [number, number, number]; pcr: number; prev: { tx: [number, number, number]; pcr: number } | null } | null };
const yi = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function Taiex() {
  const { data: m } = usePoll<Market>("/api/market?lite=1", 20_000);
  const { data: t } = usePoll<T>("/api/taiex", 20_000);
  const { data: ch } = usePoll<Ch>("/api/chips");
  const { data: scan } = useScan();
  const [idx, setIdx] = useState<"t00" | "o00">("t00");
  const [mkt, setMkt] = useState<"all" | "tse" | "otc">("all");
  const q = m?.indices.find((x) => x.c === idx);
  const b = m?.breadth;
  const rows = useMemo(() => (scan?.rows ?? []).filter((r) => r.vol > 0 && (mkt === "all" || r.m === mkt)), [scan, mkt]);
  const sectors = useMemo(() => {
    const g: Record<string, { cap: number; w: number; up: number; dn: number }> = {};
    for (const r of scan?.rows ?? []) { if (!r.vol) continue; const x = (g[r.ind] ??= { cap: 0, w: 0, up: 0, dn: 0 }); x.cap += r.cap; x.w += r.cap * r.pct; if (r.pct > 0) x.up++; else if (r.pct < 0) x.dn++; }
    return Object.entries(g).map(([k, v]) => ({ k, ...v, pct: v.cap ? v.w / v.cap : 0 })).sort((a, z) => z.pct - a.pct);
  }, [scan]);
  // 權值股貢獻點數：拉抬、拖累共用同一個比例尺（最大的那檔滿格），長短才比得出來
  const ptMax = Math.max(1, ...[...(t?.contrib.up ?? []), ...(t?.contrib.down ?? [])].map((r) => Math.abs(r.pt)));
  const o = t?.orders.tse;
  const ratio = o && o.askLots ? o.bidLots / o.askLots : 0;

  return (
    <div className="grid gap-4" id="taiex-area">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">大盤</h1>
        {t?.futures?.price ? <span className="mono text-[13px]"><span className="text-text-2">台指期近一</span> {num(t.futures.price)} <span className={cls(t.futures.chg)}>{t.futures.chg > 0 ? "+" : ""}{num(t.futures.chg)}</span> <span className="text-text-2 ml-2">{t.futures.basis >= 0 ? "正價差" : "逆價差"}</span> <span className={cls(t.futures.basis)}>{yi(t.futures.basis)}</span></span> : null}
        <div className="flex-1" />
        <Link href="/chips" className="sub hover:text-text">完整籌碼 ›</Link>
        <ExportBtn name="大盤" target={() => document.getElementById("taiex-area")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        <div className="card overflow-hidden">
          <div className="px-4 pt-4 flex items-baseline gap-3 flex-wrap">
            <div className="seg"><button className={idx === "t00" ? "on" : ""} onClick={() => setIdx("t00")}>加權指數</button><button className={idx === "o00" ? "on" : ""} onClick={() => setIdx("o00")}>櫃買指數</button></div>
            {q && <><span className={`mono text-3xl font-semibold ${cls(q.chg)}`}>{price(q.price)}</span><span className={`mono ${cls(q.chg)}`}>{q.chg > 0 ? "+" : ""}{price(q.chg)} ({pct(q.pct)})</span></>}
            <span className="sub ml-auto">{m ? `${m.open ? "盤中" : "已收盤"} ${hm(m.time)}` : ""}</span>
          </div>
          <KChart key={idx} code={idx === "t00" ? "TAIEX" : "OTC"} title={idx === "t00" ? "加權指數" : "櫃買指數"} prev={q?.prev} height={420} defaultTf="1d" />
          {b && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pb-4 pt-2 text-[13px]">
              <div><div className="sub">成交金額</div><div className="mono text-lg">{num(b.value)} 億</div></div>
              <div><div className="sub">漲停 / 跌停</div><div className="mono text-lg"><span className="up">{b.limitUp}</span> / <span className="down">{b.limitDown}</span></div></div>
              <div><div className="sub">三大法人{ch ? `（${md(ch.date)}）` : ""}</div><div className={`mono text-lg ${cls(ch?.market.total ?? 0)}`}>{ch ? `${yi(ch.market.total)} 億` : "—"}</div></div>
              <div><div className="sub">漲 {b.up} · 平 {b.flat} · 跌 {b.down}</div>
                <div className="flex h-2 mt-2 rounded overflow-hidden gap-[2px]"><div style={{ flex: b.up, background: "var(--up)" }} /><div style={{ flex: b.flat, background: "#666" }} /><div style={{ flex: b.down, background: "var(--down)" }} /></div></div>
            </div>
          )}
        </div>

        <div className="grid gap-4 content-start">
          <div className="card">
            <div className="card-h">買賣力道 <span className="sub">上市 · {m ? hm(m.time) : ""}</span><ExportBtn icon name="買賣力道" /></div>
            {o ? (
              <div className="px-4 pb-4">
                <div className="flex items-baseline"><span className="sub">委買 ÷ 委賣（張）</span><span className="ml-auto sub">{ratio >= 1 ? "買盤掛單多於賣盤" : "賣盤掛單多於買盤"}</span></div>
                <div className={`mono text-3xl font-semibold ${ratio >= 1 ? "up" : "down"}`}>{ratio.toFixed(2)}</div>
                <div className="flex h-2 rounded overflow-hidden mt-2"><div style={{ flex: o.bidLots, background: "var(--up)" }} /><div style={{ flex: o.askLots, background: "var(--down)" }} /></div>
                <div className="flex justify-between mono text-[12px] mt-1"><span className="up">委買 {num(o.bidLots)}</span><span className="down">委賣 {num(o.askLots)}</span></div>
                <OrdersLine line={t!.ordersLine} />
                <div className="flex justify-between mono text-[12px] text-text-2 mt-2"><span>每筆委買 {(o.bidLots / Math.max(1, o.bidCnt)).toFixed(1)} 張</span><span>每筆委賣 {(o.askLots / Math.max(1, o.askCnt)).toFixed(1)} 張</span><span>成交 {num(o.value)} 億</span></div>
              </div>
            ) : <div className="sub px-4 pb-4">{t ? "目前沒有委託統計" : "載入中…"}</div>}
          </div>
          {t && (
            <div className="card">
              <div className="card-h">權值股貢獻點數 <span className="sub">加權指數 · 估算</span><ExportBtn icon name="權值股貢獻點數" /></div>
              <div className="grid grid-cols-2 gap-4 px-4 pb-4 text-[13px]">
                {[{ t: "拉抬", s: t.contrib.upSum, l: t.contrib.up }, { t: "拖累", s: t.contrib.downSum, l: t.contrib.down }].map((x) => (
                  <div key={x.t}>
                    <div className="flex sub"><span>{x.t}</span><span className={`ml-auto mono ${cls(x.s)}`}>{yi(x.s)} 點</span></div>
                    {x.l.map((r) => (
                      <Link key={r.c} href={`/stock/${r.c}`} className="block py-1 hover:text-[var(--gold-2)]">
                        <div className="flex"><span className="truncate">{r.n} <span className="sub mono">{r.c}</span></span><span className={`ml-auto mono ${cls(r.pt)}`}>{yi(r.pt)}</span></div>
                        <div className="flex items-center gap-2"><div className="flex-1 h-1 bg-panel-2 rounded"><div className="h-full rounded" style={{ width: `${Math.min(100, (Math.abs(r.pt) / ptMax) * 100)}%`, background: r.pt >= 0 ? "var(--up)" : "var(--down)" }} /></div><span className={`mono text-[11px] ${cls(r.pct)}`}>{pct(r.pct)}</span></div>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <div className="card-h">漲跌家數<div className="seg">{(["all", "tse", "otc"] as const).map((k) => <button key={k} className={mkt === k ? "on" : ""} onClick={() => setMkt(k)}>{k === "all" ? "全部" : k === "tse" ? "上市" : "上櫃"}</button>)}</div><ExportBtn icon name="漲跌家數" /></div>
          <div className="px-4 grid grid-cols-3 text-center text-[13px]">
            <div><div className="sub">上漲</div><div className="mono text-lg up">{rows.filter((r) => r.pct > 0).length}</div></div>
            <div><div className="sub">平盤</div><div className="mono text-lg">{rows.filter((r) => r.pct === 0).length}</div></div>
            <div><div className="sub">下跌</div><div className="mono text-lg down">{rows.filter((r) => r.pct < 0).length}</div></div>
          </div>
          <div className="px-4 pb-4 pt-2"><Distribution rows={rows} height={170} /></div>
        </div>
        <div className="card">
          <div className="card-h">法人與信用 <span className="sub">{ch ? md(ch.date) : ""}</span><Link href="/chips" className="sub hover:text-text">籌碼 ›</Link></div>
          {ch ? (
            <div className="px-4 pb-4 text-[13px]">
              {[["三大法人合計", ch.market.total], ["外資", ch.market.f], ["投信", ch.market.t], ["自營商", ch.market.d]].map(([l, v]) => (
                <div key={l as string} className="flex py-1.5 border-t border-[#1c1f24]"><span>{l}</span><span className={`ml-auto mono ${cls(v as number)}`}>{yi(v as number)} 億</span></div>
              ))}
              <div className="flex py-1.5 border-t border-[#1c1f24]"><span>融資餘額</span><span className="ml-auto mono">{num(ch.market.marginAmt, 1)} 億</span><span className={`mono w-16 text-right ${cls(ch.market.marginChg ?? 0)}`}>{ch.market.marginChg != null ? yi(ch.market.marginChg) : ""}</span></div>
              <div className="flex py-1.5 border-t border-[#1c1f24]"><span>融券餘額</span><span className="ml-auto mono">{num(ch.market.shortLots)} 張</span><span className={`mono w-16 text-right ${cls(ch.market.shortChg ?? 0)}`}>{ch.market.shortChg != null ? `${ch.market.shortChg > 0 ? "+" : ""}${num(ch.market.shortChg)}` : ""}</span></div>
              {ch.futures && <>
                <div className="flex py-1.5 border-t border-[#1c1f24]"><span>外資台指期淨未平倉</span><span className={`ml-auto mono ${cls(ch.futures.tx[0])}`}>{num(ch.futures.tx[0])} 口</span><span className="mono w-16 text-right text-text-2">{ch.futures.prev ? `${ch.futures.tx[0] - ch.futures.prev.tx[0] > 0 ? "+" : ""}${num(ch.futures.tx[0] - ch.futures.prev.tx[0])}` : ""}</span></div>
                <div className="flex py-1.5 border-t border-[#1c1f24]"><span>選擇權 Put/Call 比{ch.futures.date ? <span className="sub">（{md(ch.futures.date)}）</span> : null}</span><span className="ml-auto mono">{ch.futures.pcr ? `${ch.futures.pcr.toFixed(2)}%` : "—"}</span><span className="mono w-16 text-right text-text-2">{ch.futures.pcr && ch.futures.prev?.pcr ? `${ch.futures.pcr - ch.futures.prev.pcr > 0 ? "+" : ""}${(ch.futures.pcr - ch.futures.prev.pcr).toFixed(2)}` : ""}</span></div>
              </>}
            </div>
          ) : <div className="sub px-4 pb-4">載入中…</div>}
        </div>
        <div className="card">
          <div className="card-h">類股漲跌 <span className="sub">市值加權</span><Link href="/heatmap" className="sub hover:text-text">熱力圖 ›</Link></div>
          <div className="scroll-y max-h-[300px] px-4 pb-3 text-[13px]">
            {sectors.map((s) => (
              <Link key={s.k} href={`/sector`} className="flex items-center gap-2 py-1 hover:text-[var(--gold-2)]">
                <span className="w-24 truncate">{s.k}</span><span className="sub mono w-20"><span className="up">{s.up}↑</span> <span className="down">{s.dn}↓</span></span>
                <div className="flex-1 h-1.5 bg-panel-2 rounded"><div className="h-full rounded" style={{ width: `${Math.min(100, Math.abs(s.pct) * 15)}%`, background: s.pct >= 0 ? "var(--up)" : "var(--down)" }} /></div>
                <span className={`mono w-14 text-right ${cls(s.pct)}`}>{pct(s.pct)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {t && (
        <div className="card">
          <div className="card-h">國際行情 <span className="sub">延遲報價</span></div>
          <div className="grid gap-3 px-4 pb-4">
            {["美股", "美股期貨", "亞洲", "匯率與利率"].map((g) => (
              <div key={g}>
                <div className="sub mb-1.5">{g}</div>
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                  {t.world.filter((w) => w.g === g).map((w) => (
                    <div key={w.s} className="rounded-xl bg-panel-2 px-3 py-2">
                      <div className="flex items-center text-[13px]"><span className="truncate">{w.n}</span><span className={`ml-auto mono text-[12px] ${cls(w.chg)}`}>{w.price ? pct(w.pct) : ""}</span></div>
                      <div className="flex items-end gap-2">
                        <span className="mono text-[17px] font-semibold">{w.price ? num(w.price, 2) : "—"}</span>
                        <span className="ml-auto"><Spark data={w.spark} base={w.prev} w={80} h={24} /></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 委買減委賣（萬張）隨時間 */
function OrdersLine({ line }: { line: [string, number, number][] }) {
  if (line.length < 2) return <div className="sub text-[12px] mt-3">盤中每 30 秒記一筆，記錄器開始跑之後這裡會畫出買賣平衡線。</div>;
  const v = line.map((x) => (x[1] - x[2]) / 1e4);
  const lo = Math.min(0, ...v), hi = Math.max(0, ...v), W = 400, H = 80;
  const y = (z: number) => H - 4 - ((z - lo) / (hi - lo || 1)) * (H - 8);
  const d = v.map((z, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * W).toFixed(1)},${y(z).toFixed(1)}`).join("");
  const last = v[v.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full mt-3">
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#3a3f47" strokeDasharray="3 3" /><text x={W / 2} y={y(0) - 3} fill="#646a73" fontSize={10} textAnchor="middle">買賣平衡</text>
      <path d={d} fill="none" stroke={last >= 0 ? "var(--up)" : "var(--down)"} strokeWidth={1.5} />
      <text x={0} y={H + 12} fill="#646a73" fontSize={10}>{line[0][0]}</text><text x={W} y={H + 12} fill="#646a73" fontSize={10} textAnchor="end">{line[line.length - 1][0]}</text>
      <text x={W} y={10} fill="#646a73" fontSize={10} textAnchor="end">{last >= 0 ? "+" : ""}{last.toFixed(0)} 萬張</text>
    </svg>
  );
}
