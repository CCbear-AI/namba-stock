"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePoll } from "@/components/hooks";
import ExportBtn from "@/components/ExportBtn";
import { recordRiver } from "@/components/River";
import { cls, pct } from "@/components/fmt";
import { industryGroup } from "@/lib/industries";
import type { FlowDay } from "@/lib/flow";

type Resp = { day: FlowDay | null; names?: Record<string, [string, string]>; fresh?: boolean };
const WINDOWS = [{ k: 5, l: "5 分" }, { k: 15, l: "15 分" }, { k: 30, l: "30 分" }, { k: 0, l: "全天" }];
const GROUPS = ["全部", "電子", "金融", "傳產"] as const;
const sec = (t: string) => { const [h, m, s] = t.split(":").map(Number); return h * 3600 + m * 60 + (s || 0); };
const yi = (v: number, d = 2) => `${v > 0 ? "+" : ""}${v.toFixed(d)} 億`;

export default function FlowLive() {
  const { data: daysResp } = usePoll<{ days: string[] }>("/api/flowlive/days", 60_000);
  const days = daysResp?.days ?? [];
  const [date, setDate] = useState<string | null>(null);
  const shownDate = date ?? days[0] ?? null;
  const isLatest = !date || date === days[0];
  const { data } = usePoll<Resp>(shownDate ? `/api/flowlive?date=${shownDate}` : null, isLatest ? 30_000 : 0);
  const day = data?.day ?? null;
  const names = useMemo(() => data?.names ?? {}, [data]);
  const [win, setWin] = useState(0);
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("全部");
  const [cursor, setCursor] = useState<number | null>(null); // null = 跟著最新
  const [playing, setPlaying] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  const pts = useMemo(() => day?.points ?? [], [day]);
  const idx = cursor == null ? pts.length - 1 : Math.min(cursor, pts.length - 1);
  const live = isLatest && cursor == null && Boolean(data?.fresh);

  // 回放
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setCursor((c) => {
        const n = (c ?? -1) + 1;
        if (n >= pts.length - 1) { setPlaying(false); return null; }
        return n;
      });
    }, 120);
    return () => clearInterval(timer.current);
  }, [playing, pts.length]);

  // 時間窗：現在這一點減掉 N 分鐘前那一點
  const rows = useMemo(() => {
    if (idx < 0 || !pts[idx]) return [];
    const p = pts[idx];
    let base: (typeof pts)[number] | null = null;
    if (win) {
      const target = sec(p.t) - win * 60;
      for (let j = idx; j >= 0; j--) if (sec(pts[j].t) <= target) { base = pts[j]; break; }
      base ??= pts[0];
    }
    return Object.entries(p.s)
      .filter(([k]) => group === "全部" || industryGroup(k) === group)
      .map(([k, [net, value, chg]]) => {
        const b = base?.s[k];
        return { k, net: b ? net - b[0] : net, value: b ? value - b[1] : value, chg, dayNet: net };
      })
      .sort((a, b) => b.net - a.net);
  }, [pts, idx, win, group]);

  // 匯出影片：把當天每一筆紀錄依序播放（各板塊主動買賣淨額）
  const [vprog, setVprog] = useState<number | null>(null);
  const exportVideo = async () => {
    const step = Math.max(1, Math.ceil(pts.length / 150));
    const frames = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => ({
      t: p.t.slice(0, 5),
      v: Object.fromEntries(Object.entries(p.s).filter(([k]) => group === "全部" || industryGroup(k) === group).map(([k, v]) => [k, v[0]])),
    }));
    const names = new Map(Object.keys(frames.at(-1)?.v ?? {}).map((k) => [k, { n: k, ind: k }]));
    setVprog(0);
    const blob = await recordRiver(`資金流向 ${day?.date ?? ""}${group === "全部" ? "" : ` · ${group}`}`, names, frames, setVprog, "億");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `資金流-${day?.date ?? ""}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
    a.click();
    setTimeout(() => setVprog(null), 1500);
  };

  const total = rows.reduce((s, r) => s + r.net, 0);
  const best = rows[0], worst = rows[rows.length - 1];
  const sel = rows.find((r) => r.k === pick) ?? best;
  const maxAbs = Math.max(0.01, ...rows.map((r) => Math.abs(r.net)));
  const maxVal = Math.max(0.01, ...rows.map((r) => r.value));
  const winLabel = win ? `近 ${win} 分鐘` : "開盤到現在";

  // 選取板塊的成分股（最新快照的全天累積）
  const cons = useMemo(() => {
    if (!day || !sel) return { buy: [], sell: [] };
    const list = Object.entries(day.stocks).filter(([c]) => names[c]?.[1] === sel.k).map(([c, v]) => ({ c, n: names[c][0], net: v[0], value: v[1], pct: v[2] }));
    list.sort((a, b) => b.net - a.net);
    return { buy: list.slice(0, 5).filter((x) => x.net > 0), sell: list.slice(-5).reverse().filter((x) => x.net < 0) };
  }, [day, sel, names]);

  const series = useMemo(() => (sel ? pts.slice(0, idx + 1).map((p) => ({ t: p.t, v: p.s[sel.k]?.[0] ?? 0 })) : []), [pts, idx, sel]);
  const totalSeries = useMemo(() => pts.slice(0, idx + 1).map((p) => ({ t: p.t, v: Object.entries(p.s).filter(([k]) => group === "全部" || industryGroup(k) === group).reduce((s, [, v]) => s + v[0], 0) })), [pts, idx, group]);

  return (
    <div className="grid gap-4 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">資金板塊即時流向</h1>
        {live && <span className="chip">● 即時 · 每 30 秒</span>}
        <div className="flex-1" />
        <span className="sub">日期</span>
        <select className="bg-panel-2 border border-line rounded-full px-3 py-1 text-[13px]" value={date ?? ""} onChange={(e) => { setDate(e.target.value || null); setCursor(null); setPlaying(false); }}>
          <option value="">最新</option>
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="seg">{WINDOWS.map((w) => <button key={w.k} className={win === w.k ? "on" : ""} onClick={() => setWin(w.k)}>{w.l}</button>)}</div>
        <div className="seg">{GROUPS.map((g) => <button key={g} className={group === g ? "on" : ""} onClick={() => setGroup(g)}>{g}</button>)}</div>
        <ExportBtn name="即時資金流" target={() => document.querySelector("main")} />
        <button className="btn" disabled={pts.length < 2 || vprog != null} onClick={exportVideo}>🎬 {vprog != null ? `${Math.round(vprog * 100)}%` : "匯出影片"}</button>
      </div>

      {!day ? (
        <div className="card p-8 text-center text-text-2">{daysResp && (!days.length || data) ? "還沒有任何一天的盤中紀錄。記錄程式會在交易日 09:00–13:30 每 30 秒記一筆，每天存檔。" : <span className="loading">資料載入中…</span>}</div>
      ) : (
        <>
          <div className="card px-4 py-2 text-[13px] text-text-2">
            {live ? "盤中即時資料：每 30 秒更新。拖動下方時間軸可以回放今天稍早的資金流向。" : `現在看的是 ${day.date} 的盤中紀錄（每 30 秒一筆的真實資料）。可以按下方 ▶ 回放，或從右上角挑別天。`}
            <span className="ml-2 text-dim">主動買賣淨額＝外盤成交金額 − 內盤成交金額（依兩次快照間的成交量與五檔推算）</span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="card px-4 py-3">
              <div className="sub">全市場主動買賣淨額 · {winLabel}</div>
              <div className={`mono text-2xl font-semibold ${cls(total)}`}>{yi(total)}</div>
              <Spark data={totalSeries} h={36} />
            </div>
            <div className="card px-4 py-3">
              <div className="sub">吸金最多</div>
              {best && <><div className="text-lg font-semibold"><span className="up">●</span> {best.k}</div><div className={`mono ${cls(best.net)}`}>{yi(best.net)}</div></>}
            </div>
            <div className="card px-4 py-3">
              <div className="sub">失血最多</div>
              {worst && <><div className="text-lg font-semibold"><span className="down">●</span> {worst.k}</div><div className={`mono ${cls(worst.net)}`}>{yi(worst.net)}</div></>}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <div className="card">
              <div className="card-h">資金河道 <span className="sub">{winLabel} · 線越長淨流入/流出越多，越粗代表成交越大，點選看板塊細節</span></div>
              <div className="flex justify-center gap-6 text-[12px] pb-1"><span className="down">◀ 流出</span><span className="up">流入 ▶</span></div>
              <div className="px-3 pb-3">
                {rows.map((r) => {
                  const w = (Math.abs(r.net) / maxAbs) * 50;
                  const thick = 6 + (r.value / maxVal) * 18;
                  return (
                    <button key={r.k} onClick={() => setPick(r.k)} className={`w-full flex items-center gap-2 py-[3px] rounded-lg px-2 ${sel?.k === r.k ? "bg-panel-2" : "hover:bg-panel-2/60"}`}>
                      <span className="w-24 text-left truncate text-[13px]">{r.k}</span>
                      <div className="relative flex-1 h-7">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-line" />
                        <div className="absolute top-1/2 -translate-y-1/2 rounded-full transition-all duration-300"
                          style={{ height: thick, width: `${w}%`, left: r.net >= 0 ? "50%" : `${50 - w}%`, background: r.net >= 0 ? "linear-gradient(90deg,#f0505a55,#f0505a)" : "linear-gradient(270deg,#22b57355,#22b573)" }} />
                      </div>
                      <span className={`mono w-24 text-right text-[13px] ${cls(r.net)}`}>{yi(r.net)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {sel && (
              <div className="card">
                <div className="card-h">{sel.k} <span className="sub">板塊細節</span></div>
                <div className="px-4 pb-4 grid gap-3">
                  <div className="grid grid-cols-3 gap-2 text-[13px]">
                    <div className="bg-panel-2 rounded-lg p-2"><div className="sub">漲跌幅</div><div className={`mono ${cls(sel.chg)}`}>{pct(sel.chg)}</div></div>
                    <div className="bg-panel-2 rounded-lg p-2"><div className="sub">主動買賣</div><div className={`mono ${cls(sel.net)}`}>{yi(sel.net, 1)}</div></div>
                    <div className="bg-panel-2 rounded-lg p-2"><div className="sub">成交值</div><div className="mono">{sel.value.toFixed(0)} 億</div></div>
                  </div>
                  <div>
                    <div className="sub mb-1">開盤累積主動買賣淨額 · 到 {pts[idx]?.t.slice(0, 5)}</div>
                    <Spark data={series} h={110} axis />
                  </div>
                  <ConsList title="主動買超前五" list={cons.buy} />
                  <ConsList title="主動賣超前五" list={cons.sell} />
                  <div className="text-[11px] text-dim">個股數字為今天到最新一筆為止的累計，不隨時間軸變動。</div>
                </div>
              </div>
            )}
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-20 bg-[var(--bg)]/95 backdrop-blur border-t border-line">
            <div className="max-w-[1440px] mx-auto px-4 py-3 flex items-center gap-3">
              <button className="btn gold !rounded-full w-9 h-9 justify-center !p-0" onClick={() => { if (!playing && cursor == null) setCursor(0); setPlaying(!playing); }} aria-label={playing ? "暫停" : "播放"}>{playing ? "❚❚" : "▶"}</button>
              <span className="mono text-lg w-14">{pts[idx]?.t.slice(0, 5)}</span>
              <input type="range" min={0} max={Math.max(0, pts.length - 1)} value={idx < 0 ? 0 : idx} onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setCursor(v >= pts.length - 1 ? null : v); }} className="flex-1 accent-[var(--gold)]" />
              <span className="mono text-text-2 text-[12px] w-12 text-right">{pts[pts.length - 1]?.t.slice(0, 5)}</span>
              {cursor != null && <button className="btn" onClick={() => { setCursor(null); setPlaying(false); }}>回到最新</button>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ConsList({ title, list }: { title: string; list: { c: string; n: string; net: number; pct: number }[] }) {
  return (
    <div>
      <div className="sub mb-1">{title}</div>
      {list.map((x) => (
        <Link key={x.c} href={`/stock/${x.c}`} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-panel-2 text-[13px]">
          <span className="mono text-text-2 w-12">{x.c}</span><span className="flex-1 truncate">{x.n}</span>
          <span className={`mono w-16 text-right ${cls(x.pct)}`}>{pct(x.pct)}</span>
          <span className={`mono w-20 text-right ${cls(x.net)}`}>{yi(x.net)}</span>
        </Link>
      ))}
      {!list.length && <div className="text-[12px] text-dim py-1">沒有</div>}
    </div>
  );
}

function Spark({ data, h, axis = false }: { data: { t: string; v: number }[]; h: number; axis?: boolean }) {
  if (data.length < 2) return <div style={{ height: h }} />;
  const W = 300;
  const vs = data.map((d) => d.v);
  const mx = Math.max(0, ...vs), mn = Math.min(0, ...vs);
  const span = mx - mn || 1;
  const t0 = sec(data[0].t), t1 = Math.max(sec("13:30:00"), sec(data[data.length - 1].t));
  const x = (t: string) => ((sec(t) - t0) / (t1 - t0 || 1)) * W;
  const y = (v: number) => h - 4 - ((v - mn) / span) * (h - 8);
  const d = data.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const last = data[data.length - 1].v;
  const col = last >= 0 ? "#f0505a" : "#22b573";
  return (
    <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }}>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#3a3f47" strokeDasharray="3 3" />
      <path d={`${d}L${x(data[data.length - 1].t)},${y(0)}L${x(data[0].t)},${y(0)}Z`} fill={col} opacity={0.12} />
      <path d={d} fill="none" stroke={col} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      {axis && <text x={2} y={11} fontSize={10} fill="#646a73">{mx.toFixed(1)} 億</text>}
      {axis && <text x={2} y={h - 2} fontSize={10} fill="#646a73">{mn.toFixed(1)} 億</text>}
    </svg>
  );
}
