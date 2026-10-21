"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePoll } from "@/components/hooks";
import { cls, pct, price, hm } from "@/components/fmt";
import ExportBtn from "@/components/ExportBtn";
import type { ScanRow } from "@/lib/scan";

type Scan = { time: number; open: boolean; rows: ScanRow[] };
type Tab = "ath" | "near" | "atl";
const SPIDERS = 32;
const NEAR = 0.03; // 離歷史高點 3% 以內算「即將破頂」
const isAth = (r: ScanRow) => r.ath > 0 && r.vol > 0 && r.high > r.ath;
const isNear = (r: ScanRow) => r.ath > 0 && r.vol > 0 && !isAth(r) && r.price >= r.ath * (1 - NEAR);
const isAtl = (r: ScanRow) => r.atl > 0 && r.vol > 0 && r.low < r.atl;
const FIRST_KEY = "namba.radar.first";

export default function Radar() {
  const { data } = usePoll<Scan>("/api/scan", 20_000);
  const [tab, setTab] = useState<Tab>("ath");
  const [sound, setSound] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sort, setSort] = useState<"pct" | "dist">("pct");
  const area = useRef<HTMLDivElement>(null);
  const known = useRef<Set<string> | null>(null);
  const [first, setFirst] = useState<Record<string, string>>({});

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

  // 每次資料更新，蜘蛛重新爬一遍（約 8 秒）
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
  }, [data?.time, order.length]);
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
  const closest = useMemo(() => rows.filter((r) => r.vol > 0 && !isAth(r)).sort((a, b) => b.price / b.ath - a.price / a.ath).slice(0, 3), [rows]);
  const athSet = new Set(ath.map((r) => r.c)), nearSet = new Set(near.map((r) => r.c)), atlSet = new Set(atl.map((r) => r.c));

  return (
    <div className="grid gap-4" ref={area}>
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Noto Serif TC', serif" }}>破頂雷達</h1>
          <div className="sub mt-1 flex items-center gap-2"><span className={`inline-block w-2 h-2 rounded-full ${data?.open ? "bg-[var(--up)] animate-pulse" : "bg-dim"}`} />{data?.open ? "盤中" : "已收盤"} · 每 20 秒重新比對 {data ? hm(data.time) : ""}</div>
        </div>
        <div className="ml-auto w-72">
          <div className="flex items-center gap-2 text-[13px]">
            <button data-noexport onClick={() => setSound(!sound)} title={sound ? "關閉音效" : "打開音效"} aria-label={sound ? "關閉音效" : "打開音效"} className="text-text-2 hover:text-text">{sound ? "🔊" : "🔈"}</button>
            <span>蜘蛛 × {SPIDERS}</span><span className="ml-auto mono sub">{scanned.toLocaleString()} / {order.length.toLocaleString()}</span>
          </div>
          <div className="h-1 bg-panel-2 rounded mt-2 overflow-hidden"><div className="h-full bg-[var(--gold)]" style={{ width: `${progress * 100}%` }} /></div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_360px] items-center">
        <div>
          <div className="text-3xl font-bold" style={{ fontFamily: "'Noto Serif TC', serif" }}>今天 <span className="up">{ath.length}</span> 檔創上市以來新高</div>
          <div className="sub mt-1">{progress < 1 ? "蜘蛛正在逐檔比對每一檔上市以來的最高價與最低價…" : `掃描完成：即將破頂 ${near.length} 檔、創歷史新低 ${atl.length} 檔`}</div>
        </div>
        <div className="card px-4 py-3 text-[13px]">
          {progress < 1 ? <div className="sub text-center py-2">掃完會在這裡顯示離歷史新高最近的股票</div> : (
            <>
              <div className="sub mb-1">離歷史新高最近</div>
              {closest.map((r) => (
                <Link key={r.c} href={`/stock/${r.c}`} className="flex gap-2 py-0.5 hover:text-[var(--gold-2)]">
                  <span className="mono text-text-2">{r.c}</span><span className="flex-1">{r.n}</span>
                  <span className="mono">{price(r.price)}</span><span className="mono down">距前高 {pct((r.price / r.ath - 1) * 100)}</span>
                </Link>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="card p-4 relative overflow-hidden">
          {groups.map((g) => {
            const hi = g.l.filter((r) => athSet.has(r.c)).length;
            return (
              <div key={g.k} className="mb-3">
                <div className="text-[13px] mb-1"><b>{g.k}</b> <span className="sub">{g.l.length}</span>{hi > 0 && <span className="up ml-2">新高 {hi}</span>}</div>
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
          {!rows.length && <div className="sub text-center py-16 loading">雷達暖機中…（需要先有歷史最高價資料）</div>}
          {progress < 1 && rows.length > 0 && <Spiders progress={progress} />}
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
                        {tab === "near" ? `距前高 ${price(r.ath)} 還差 ${pct(-d)}` : `${first[r.c] ?? ""} ${tab === "ath" ? "破頂 · 高於前高" : "破底 · 低於前低"} `}
                        {tab !== "near" && <span className={tab === "ath" ? "up" : "down"}>{pct(tab === "ath" ? (r.high / r.ath - 1) * 100 : d)}</span>}
                      </div>
                    </div>
                    <div className="text-right mono"><div>{price(r.price)}</div><div className={cls(r.pct)}>{pct(r.pct)}</div></div>
                  </Link>
                );
              })}
              {!list.length && <div className="sub text-center py-8">{progress < 1 ? "蜘蛛還在爬，抓到的會飛進來" : "目前沒有"}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 爬來爬去的蜘蛛（純裝飾，跟著掃描進度往下爬） */
function Spiders({ progress }: { progress: number }) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const t = progress * 6 + i * 0.37;
    return { x: 8 + ((Math.sin(t * 2.1 + i) + 1) / 2) * 84, y: Math.min(96, progress * 100 + Math.sin(t * 3 + i * 2) * 6) };
  });
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      {pts.map((p, i) => (
        <svg key={i} x={`${p.x}%`} y={`${p.y}%`} overflow="visible">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
            const a = (k / 8) * Math.PI * 2 + progress * 40;
            return <line key={k} x1={0} y1={0} x2={Math.cos(a) * 14} y2={Math.sin(a) * 14} stroke="#5aa9ff" strokeWidth={1} opacity={0.8} />;
          })}
          <circle r={4} fill="#d9b45a" />
        </svg>
      ))}
    </svg>
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
