"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePoll } from "@/components/hooks";
import { cls, pct, price, hm } from "@/components/fmt";
import ExportBtn from "@/components/ExportBtn";
import type { ScanRow } from "@/lib/scan";

type Scan = { time: number; open: boolean; rows: ScanRow[] };
type Tab = "ath" | "near" | "atl";
const NEAR = 0.03; // 離歷史高點 3% 以內算「即將破頂」
// 平前高、平前低也算（跟里長伯一致）
const isAth = (r: ScanRow) => r.ath > 0 && r.vol > 0 && r.price >= r.ath;
const isNear = (r: ScanRow) => r.ath > 0 && r.vol > 0 && !isAth(r) && r.price >= r.ath * (1 - NEAR);
const isAtl = (r: ScanRow) => r.atl > 0 && r.vol > 0 && r.price <= r.atl;
const FIRST_KEY = "namba.radar.first";

export default function Radar() {
  const { data } = usePoll<Scan>("/api/scan", 20_000);
  const { data: ev } = usePoll<{ today?: boolean; ath: Record<string, [string, number]>; atl: Record<string, [string, number]> }>("/api/events", 30_000);
  const [tab, setTab] = useState<Tab>("ath");
  const [sound, setSound] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sort, setSort] = useState<"pct" | "dist">("pct");
  const area = useRef<HTMLDivElement>(null);
  const known = useRef<Set<string> | null>(null);
  const [first, setFirst] = useState<Record<string, string>>({});
  const [rescan, setRescan] = useState(0);
  const [slide, setSlide] = useState(0);

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.ath > 0), [data]);
  const groups = useMemo(() => {
    const by: Record<string, ScanRow[]> = {};
    for (const r of rows) (by[r.ind] ??= []).push(r);
    return Object.entries(by).map(([k, l]) => ({ k, l: l.sort((a, b) => b.cap - a.cap) })).sort((a, b) => b.l.length - a.l.length);
  }, [rows]);
  const order = useMemo(() => groups.flatMap((g) => g.l.map((r) => r.c)), [groups]);
  const ath = useMemo(() => rows.filter(isAth), [rows]);
  const near = useMemo(() => rows.filter(isNear), [rows]);
  const atl = useMemo(() => rows.filter(isAtl), [rows]);

  // 每次資料更新，重新逐檔掃描一遍（約 8 秒）
  useEffect(() => {
    if (!order.length) return;
    const t0 = performance.now(), dur = 8000;
    let id = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      setProgress(p);
      if (p < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [data?.time, order.length, rescan]);
  const scanned = Math.floor(progress * order.length);
  const done = new Set(order.slice(0, scanned));

  // 第一次看到破頂的時間（存在這台裝置，當天有效）＋ 音效
  useEffect(() => {
    if (!data) return;
    const day = new Date(data.time + 8 * 3600e3).toISOString().slice(0, 10);
    let saved: { day: string; m: Record<string, string> } = { day, m: {} };
    try { const v = JSON.parse(localStorage.getItem(FIRST_KEY) ?? "null"); if (v?.day === day) saved = v; } catch { /* */ }
    const now = hm(data.time);
    let fresh = 0;
    for (const r of [...ath, ...atl]) if (!saved.m[r.c]) { saved.m[r.c] = now; fresh++; }
    try { localStorage.setItem(FIRST_KEY, JSON.stringify(saved)); } catch { /* */ }
    // 跟瀏覽器儲存的「第一次看到」同步
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFirst(saved.m);
    if (known.current && fresh && sound) beep();
    known.current = new Set(Object.keys(saved.m));
  }, [data, ath, atl, sound]);

  const list = (tab === "ath" ? ath : tab === "near" ? near : atl).slice().sort((a, b) =>
    sort === "pct" ? (tab === "atl" ? a.pct - b.pct : b.pct - a.pct) : Math.abs(a.price / a.ath - 1) - Math.abs(b.price / b.ath - 1));
  const closest = useMemo(() => rows.filter((r) => r.vol > 0 && !isAth(r)).sort((a, b) => b.price / b.ath - a.price / a.ath).slice(0, 5), [rows]);
  // 「最接近破頂」卡片每 4 秒換一檔
  useEffect(() => {
    if (closest.length < 2) return;
    const t = setInterval(() => setSlide((x) => (x + 1) % closest.length), 4000);
    return () => clearInterval(t);
  }, [closest.length]);
  // 破頂時間：盤中記錄器記的優先
  const firstAt = (c: string) => (ev?.today ? ev.ath[c]?.[0] ?? ev.atl[c]?.[0] : undefined) ?? first[c];
  const athSorted = ath.slice().sort((a, b) => (firstAt(a.c) ?? "99").localeCompare(firstAt(b.c) ?? "99"));
  const earliest = athSorted[0], latest = athSorted.at(-1);
  const nearSorted = near.slice().sort((a, b) => b.price / b.ath - a.price / a.ath);
  const athSet = new Set(ath.map((r) => r.c)), nearSet = new Set(near.map((r) => r.c)), atlSet = new Set(atl.map((r) => r.c));

  return (
    <div className="grid gap-4" ref={area}>
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Noto Serif TC', serif" }}>新高追蹤</h1>
          <div className="sub mt-1 flex items-center gap-2"><span className={`inline-block w-2 h-2 rounded-full ${data?.open ? "bg-[var(--up)] animate-pulse" : "bg-dim"}`} />{data?.open ? `盤中 · 每 20 秒重新比對 ${hm(data.time)}` : data ? `收盤 · ${new Date(data.time + 8 * 3600e3).toISOString().slice(5, 10).replace("-", "/")} 的資料 ${hm(data.time)}` : ""}</div>
        </div>
        <div className="ml-auto w-72">
          <div className="flex items-center gap-2 text-[13px]">
            <button data-noexport onClick={() => setSound(!sound)} title={sound ? "關閉音效" : "打開音效"} aria-label={sound ? "關閉音效" : "打開音效"} className="text-text-2 hover:text-text">{sound ? "🔊" : "🔈"}</button>
            {progress < 1 ? <><span>掃描中</span><span className="ml-auto mono sub">{scanned.toLocaleString()} / {order.length.toLocaleString()}</span></>
              : <><span>掃描完成</span><button data-noexport className="btn !py-0.5 ml-auto" onClick={() => setRescan((x) => x + 1)}>重新掃描</button></>}
          </div>
          <div className="h-1 bg-panel-2 rounded mt-2 overflow-hidden"><div className="h-full bg-[var(--gold)]" style={{ width: `${progress * 100}%` }} /></div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_380px] items-center">
        <div id="radar-head">
          <div className="flex items-start gap-2">
            <div className="text-3xl font-bold" style={{ fontFamily: "'Noto Serif TC', serif" }}>今天 <span className="up">{ath.length}</span> 檔創上市以來新高</div>
            <span className="ml-auto"><ExportBtn icon name="創上市以來新高" target={() => document.getElementById("radar-head")} /></span>
          </div>
          <div className="sub mt-1">
            {progress < 1 ? "正在逐檔比對每一檔上市以來的最高價與最低價…" : <>
              {earliest && <>最早 {firstAt(earliest.c) ?? ""} {earliest.n}</>}{latest && latest !== earliest && <> · 最新 {firstAt(latest.c) ?? ""} {latest.n}</>}
              {earliest ? " · " : ""}另有 <span className="text-[var(--gold-2)]">{near.length}</span> 檔離高點不到 3%
            </>}
          </div>
        </div>
        <Closest list={closest} index={slide} ready={progress >= 1} onDot={setSlide} />
      </div>

      {progress >= 1 && (ath.length > 0 || nearSorted.length > 0) && (
        <div className="marquee overflow-hidden border-y border-line py-2 text-[13px] mono" aria-label="破頂與即將破頂輪播">
          <div className="marquee-track" style={{ animationDuration: `${Math.max(30, (ath.length + nearSorted.length) * 4)}s` }}>
            {[0, 1].map((k) => (
              <div key={k} className="flex items-center gap-8 pr-8" aria-hidden={k === 1}>
                {ath.map((r) => <Link key={r.c} href={`/stock/${r.c}`} className="whitespace-nowrap hover:text-[var(--gold-2)]">{r.c} {r.n} <span className={cls(r.pct)}>{pct(r.pct)}</span></Link>)}
                {nearSorted.length > 0 && <span className="chip !text-[12px] whitespace-nowrap">即將破頂 {nearSorted.length}</span>}
                {nearSorted.map((r) => <Link key={r.c} href={`/stock/${r.c}`} className="whitespace-nowrap hover:text-[var(--gold-2)]">{r.c} {r.n} <span className={cls(r.pct)}>{pct(r.pct)}</span> <span className="sub">差 {((1 - r.price / r.ath) * 100).toFixed(2)}%</span></Link>)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="card p-4 relative overflow-hidden" id="radar-grid">
          <div className="absolute right-3 top-3 z-10"><ExportBtn icon name="新高追蹤" target={() => document.getElementById("radar-grid")} /></div>
          {groups.map((g) => {
            const hi = g.l.filter((r) => athSet.has(r.c)).length;
            const nr = g.l.filter((r) => nearSet.has(r.c)).length;
            return (
              <div key={g.k} className="mb-3">
                <div className="text-[13px] mb-1"><b>{g.k}</b> <span className="sub">{g.l.length}</span>{hi > 0 && <span className="up ml-2">新高 {hi}</span>}{nr > 0 && <span className="text-[var(--gold-2)] ml-2">逼近 {nr}</span>}</div>
                <div className="flex flex-wrap gap-x-1 gap-y-0.5 mono text-[12px]">
                  {g.l.map((r) => {
                    const seen = done.has(r.c);
                    const k = athSet.has(r.c) ? "ath" : atlSet.has(r.c) ? "atl" : nearSet.has(r.c) ? "near" : "";
                    return (
                      <Link key={r.c} href={`/stock/${r.c}`} title={`${r.n} ${pct(r.pct)}`}
                        className={`px-1 rounded transition-colors duration-500 ${!seen ? "text-[#3a3f47]" : k === "ath" ? "bg-[var(--up)] text-white" : k === "atl" ? "bg-[var(--down)] text-white" : k === "near" ? "outline outline-1 outline-[var(--gold)] text-[var(--gold-2)]" : "text-text-2"}`}>
                        {r.c}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!rows.length && <div className="sub text-center py-16 loading">資料準備中…（需要先有歷史最高價資料）</div>}
        </div>

        <div className="grid gap-3 content-start">
          <div className="grid grid-cols-3 gap-2">
            {([["ath", ath.length, "創歷史新高", "up"], ["near", near.length, "即將破頂", "text-[var(--gold-2)]"], ["atl", atl.length, "創歷史新低", "down"]] as const).map(([k, n, l, c]) => (
              <button key={k} onClick={() => setTab(k)} className={`card px-3 py-2 text-left ${tab === k ? "!border-[var(--gold)] bg-[#2a2416]/60" : ""}`}>
                <div className={`mono text-2xl font-bold ${c}`}>{n}</div><div className="sub">{l}</div>
              </button>
            ))}
          </div>
          <div className="card">
            <div className="card-h">{tab === "ath" ? "創歷史新高" : tab === "near" ? "即將破頂" : "創歷史新低"}
              <span className="flex items-center gap-1">
                <button className="sub hover:text-text" onClick={() => setSort(sort === "pct" ? "dist" : "pct")}>{sort === "pct" ? (tab === "atl" ? "依跌幅" : "依漲幅") : "離高點由近到遠"}</button>
                <ExportBtn icon name={tab === "ath" ? "創歷史新高名單" : tab === "near" ? "即將破頂名單" : "創歷史新低名單"} />
              </span>
            </div>
            <div className="scroll-y max-h-[640px] px-2 pb-2">
              {list.map((r) => {
                const d = tab === "atl" ? (r.low / r.atl - 1) * 100 : (r.price / r.ath - 1) * 100;
                return (
                  <Link key={r.c} href={`/stock/${r.c}`} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-panel-2">
                    <span className="mono w-12 text-text-2">{r.c}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{r.n} <span className="sub">{r.ind}</span></div>
                      <div className="sub">
                        {tab === "near" ? `距前高 ${price(r.ath)} 還差 ${pct(-d)}` : `${firstAt(r.c) ?? ""} ${tab === "ath" ? "破頂 · 高於前高" : "破底 · 低於前低"} `}
                        {tab !== "near" && <span className={tab === "ath" ? "up" : "down"}>{pct(tab === "ath" ? (r.price / r.ath - 1) * 100 : (r.price / r.atl - 1) * 100)}</span>}
                      </div>
                    </div>
                    <div className="text-right mono"><div>{price(r.price)}</div><div className={cls(r.pct)}>{pct(r.pct)}</div></div>
                  </Link>
                );
              })}
              {!list.length && <div className="sub text-center py-8">{progress < 1 ? "掃描中，找到的會陸續出現" : "目前沒有"}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 最接近破頂：圓環＝現價占前高的比例，每 4 秒換一檔 */
function Closest({ list, index, ready, onDot }: { list: ScanRow[]; index: number; ready: boolean; onDot: (i: number) => void }) {
  const r = list[index % Math.max(1, list.length)];
  if (!ready || !r) return <div className="card px-4 py-5 sub text-center">掃完會在這裡顯示離歷史新高最近的股票</div>;
  const ratio = Math.min(1, r.price / r.ath), gap = (1 - ratio) * 100, C = 2 * Math.PI * 22;
  return (
    <div className="card px-4 py-3 flex items-center gap-4" id="radar-closest">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="22" fill="none" stroke="#2a2f36" strokeWidth="5" />
        <circle cx="28" cy="28" r="22" fill="none" stroke="var(--gold)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${C * ratio} ${C}`} transform="rotate(-90 28 28)" /></svg>
      <Link href={`/stock/${r.c}`} className="flex-1 min-w-0">
        <div className="sub">最接近破頂</div>
        <div className="text-lg font-semibold truncate"><span className="mono">{r.c}</span> {r.n}</div>
        <div className="mono text-[13px]">{price(r.price)} <span className={cls(r.pct)}>{pct(r.pct)}</span> · <span className="text-[var(--gold-2)]">差 {gap.toFixed(2)}%，再 {price(Math.max(0, r.ath - r.price))} 元</span></div>
      </Link>
      <div className="flex flex-col items-end gap-2 self-stretch">
        <div className="flex gap-1">{list.map((x, i) => <button key={x.c} aria-label={`看 ${x.n}`} onClick={() => onDot(i)} className={`h-1.5 rounded-full ${i === index % list.length ? "w-4 bg-[var(--gold)]" : "w-1.5 bg-[#3a3f47]"}`} />)}</div>
        <span className="mt-auto"><ExportBtn icon name="最接近破頂" target={() => document.getElementById("radar-closest")} /></span>
      </div>
    </div>
  );
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(); o.stop(ctx.currentTime + 0.4);
  } catch { /* 瀏覽器不支援就算了 */ }
}
