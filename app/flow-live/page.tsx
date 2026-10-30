"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePoll } from "@/components/hooks";
import ExportBtn from "@/components/ExportBtn";
import { recordRiver, GROUP_COLOR, useRankChange } from "@/components/River";
import { THEMES } from "@/lib/themes";
import { cls, pct } from "@/components/fmt";
import { industryGroup } from "@/lib/industries";
import type { FlowDay, FlowPoint } from "@/lib/flow";
import Help from "@/components/Help";

type Resp = { day: FlowDay | null; names?: Record<string, [string, string]>; fresh?: boolean };
type G = "電子" | "金融" | "傳產";
const WINDOWS = [{ k: 5, l: "5 分" }, { k: 15, l: "15 分" }, { k: 30, l: "30 分" }, { k: 0, l: "全天" }];
const GROUPS: G[] = ["電子", "金融", "傳產"];
const SHOW = 8; // 河道顯示流入前 8、流出前 8
const sec = (t: string) => { const [h, m, s] = t.split(":").map(Number); return h * 3600 + m * 60 + (s || 0); };
const yi = (v: number, d = 2) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;

/**
 * 某幾輪報價缺了部分股票時，板塊成交值會突然掉下去再跳回來；這種斷層沿用前一筆。
 * 13:25～13:30 是收盤集合競價，13:30 一次撮合的大量沒有主動買賣方向（Yahoo 會整筆算進外盤或內盤，淨額在 13:30 暴跳）
 * → 13:27 之後淨額固定在競價前的數字，成交值照算
 */
const AUCTION = "13:27";
function clean(points: FlowPoint[], key: "s" | "g" = "s"): FlowPoint[] {
  const good: Record<string, [number, number, number]> = {};
  const pre: Record<string, number> = {};
  return points.map((p) => {
    const s: FlowPoint["s"] = {};
    const auction = p.t >= AUCTION;
    for (const [k, v0] of Object.entries(p[key] ?? {})) {
      const g = good[k];
      const v: [number, number, number] = auction && pre[k] != null ? [pre[k], v0[1], v0[2]] : v0;
      // 成交值是累計的，只會變大；變小就是那一輪漏抓了股票
      if (g && v[1] < g[1] - 0.05) s[k] = g;
      else { s[k] = v; good[k] = v; }
      if (!auction) pre[k] = s[k][0];
    }
    for (const [k, g] of Object.entries(good)) if (!s[k]) s[k] = g;
    return { t: p.t, s };
  });
}

/** 資金進攻／逢低承接／拉高出貨／資金撤退 */
/** 族群的顏色分類（電子／金融／傳產） */
const THEME_GROUP: Record<string, G> = { 台塑四寶: "傳產", 重電: "傳產", 風電: "傳產", 機器人: "傳產", 軍工: "傳產" };
const groupOf = (k: string): G => THEME_GROUP[k] ?? (THEMES[k] ? "電子" : industryGroup(k));

const stance = (net: number, chg: number) =>
  net >= 0 ? (chg >= 0 ? { t: "資金進攻", c: "up" } : { t: "逢低承接", c: "up" }) : chg >= 0 ? { t: "拉高出貨", c: "down" } : { t: "資金撤退", c: "down" };

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
  const [groups, setGroups] = useState<G[]>(GROUPS);
  const [cursor, setCursor] = useState<number | null>(null); // null = 跟著最新
  const [playing, setPlaying] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [mode, setMode] = useState<"ind" | "theme">("ind");

  // 族群：記錄器有存每一輪的族群加總（p.g）就用；舊紀錄沒有的話，只能用個股最新累計湊出「全天」一筆
  const hasG = useMemo(() => (day?.points ?? []).some((p) => p.g && Object.keys(p.g).length), [day]);
  const themeFallback = useMemo((): FlowPoint[] => {
    if (!day || hasG || !day.points.length) return [];
    const s: FlowPoint["s"] = {};
    for (const [t, cs] of Object.entries(THEMES)) {
      let net = 0, value = 0, w = 0;
      for (const c of cs) { const x = day.stocks[c]; if (!x) continue; net += x[0]; value += x[1]; w += x[1] * x[2]; }
      if (value) s[t] = [Math.round(net * 100) / 100, Math.round(value * 100) / 100, Math.round((w / value) * 100) / 100];
    }
    return [{ t: day.points[day.points.length - 1].t, s }];
  }, [day, hasG]);
  const pts = useMemo(() => (mode === "ind" ? clean(day?.points ?? []) : hasG ? clean(day?.points ?? [], "g") : themeFallback), [day, mode, hasG, themeFallback]);
  const themeSnapshotOnly = mode === "theme" && !hasG;
  const idx = cursor == null ? pts.length - 1 : Math.min(cursor, pts.length - 1);
  const live = isLatest && cursor == null && Boolean(data?.fresh);
  const inGroup = (k: string) => mode === "theme" || groups.includes(industryGroup(k));

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
    let base: FlowPoint | null = null;
    const w = themeSnapshotOnly ? 0 : win;
    if (w) {
      const target = sec(p.t) - w * 60;
      for (let j = idx; j >= 0; j--) if (sec(pts[j].t) <= target) { base = pts[j]; break; }
      base ??= pts[0];
    }
    return Object.entries(p.s)
      .filter(([k]) => inGroup(k))
      .map(([k, [net, value, chg]]) => {
        const b = base?.s[k];
        return { k, net: b ? net - b[0] : net, value: b ? value - b[1] : value, chg, dayNet: net, dayValue: value };
      })
      .sort((a, b) => b.net - a.net);
  }, [pts, idx, win, groups, mode, themeSnapshotOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const rankChg = useRankChange(rows.map((r) => r.k));

  const total = rows.reduce((s, r) => s + r.net, 0);
  const best = rows[0], worst = rows[rows.length - 1];
  const sel = rows.find((r) => r.k === pick) ?? best;
  const ins = rows.filter((r) => r.net > 0).slice(0, SHOW);
  const outs = rows.filter((r) => r.net < 0).slice(-SHOW);
  const shown = [...ins, ...outs];
  const maxAbs = Math.max(0.01, ...shown.map((r) => Math.abs(r.net)));
  const maxVal = Math.max(0.01, ...shown.map((r) => r.value));
  const winLabel = win && !themeSnapshotOnly ? `近 ${win} 分鐘` : "開盤到現在";

  // 選取板塊的成分股（最新快照的全天累積）
  const cons = useMemo(() => {
    if (!day || !sel) return { buy: [], sell: [] };
    const member = mode === "theme" ? new Set(THEMES[sel.k] ?? []) : null;
    const list = Object.entries(day.stocks).filter(([c]) => (member ? member.has(c) : names[c]?.[1] === sel.k) && names[c]).map(([c, v]) => ({ c, n: names[c][0], net: v[0], value: v[1], pct: v[2] }));
    list.sort((a, b) => b.net - a.net);
    return { buy: list.slice(0, 5).filter((x) => x.net > 0), sell: list.slice(-5).reverse().filter((x) => x.net < 0) };
  }, [day, sel, names, mode]);

  const series = useMemo(() => (sel ? pts.slice(0, idx + 1).map((p) => ({ t: p.t, v: p.s[sel.k]?.[0] ?? 0 })) : []), [pts, idx, sel]);

  // 匯出影片：把當天每一筆紀錄依序播放（各板塊主動買賣淨額）
  const [vprog, setVprog] = useState<number | null>(null);
  const exportVideo = async () => {
    const step = Math.max(1, Math.ceil(pts.length / 150));
    const frames = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => ({
      t: p.t.slice(0, 5),
      v: Object.fromEntries(Object.entries(p.s).filter(([k]) => inGroup(k)).map(([k, v]) => [k, v[0]])),
    }));
    const nm = new Map(Object.keys(frames.at(-1)?.v ?? {}).map((k) => [k, { n: k, ind: k }]));
    setVprog(0);
    const blob = await recordRiver(`資金流向 ${day?.date ?? ""}`, nm, frames, setVprog, "億");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `資金流-${day?.date ?? ""}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
    a.click();
    setTimeout(() => setVprog(null), 1500);
  };

  const t0 = pts[0] ? sec(pts[0].t) : 0, tEnd = pts.length ? sec(pts[pts.length - 1].t) : 1;
  const hours = [9, 10, 11, 12, 13].map((h) => h * 3600).filter((s) => s >= t0 && s <= tEnd);

  const riverRow = (r: (typeof rows)[number]) => {
    const w = (Math.abs(r.net) / maxAbs) * 50, up = r.net >= 0;
    const thick = 4 + (r.value / maxVal) * 10; // 河道越粗成交越大
    const g = groupOf(r.k);
    const rc = rankChg.get(r.k);
    return (
      <button key={r.k} onClick={() => setPick(r.k)} className={`w-full grid grid-cols-[120px_1fr_90px] items-center h-[34px] rounded-lg px-2 ${sel?.k === r.k ? "bg-panel-2" : "hover:bg-panel-2/60"}`}>
        <span className="flex items-center gap-2 min-w-0 text-[13px]"><i className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GROUP_COLOR[g] }} /><span className="truncate">{r.k}</span>{rc ? <span className={`text-[10.5px] ${rc > 0 ? "up" : "down"}`}>{rc > 0 ? "▲" : "▼"}{Math.abs(rc)}</span> : null}</span>
        <span className="relative h-full">
          <span className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-line" />
          <span className="absolute top-1/2 -translate-y-1/2 rounded-full overflow-hidden transition-all duration-500"
            style={{ [up ? "left" : "right"]: "50%", width: `${w}%`, height: thick, background: `linear-gradient(${up ? "90deg" : "270deg"}, ${up ? "#f0505a14, #f0505a99" : "#22b57314, #22b57399"})` }}>
            <span className="river-dots" style={{ animationDirection: up ? "normal" : "reverse" }} />
          </span>
          <span className="absolute top-1/2 -translate-y-1/2 rounded-full transition-all duration-500"
            style={{ [up ? "left" : "right"]: `calc(50% + ${w}% - ${thick / 2 + 2}px)`, width: thick + 4, height: thick + 4, background: up ? "var(--up)" : "var(--down)", boxShadow: `0 0 10px ${up ? "#f0505a" : "#22b573"}` }} />
        </span>
        <span className={`mono text-right text-[13px] ${cls(r.net)}`}>{yi(r.net)} <span className="text-[11px]">億</span></span>
      </button>
    );
  };

  return (
    <div className="grid gap-4 pb-28">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">資金板塊即時流向</h1>
        {live && <span className="chip">● 即時 · 每 30 秒</span>}
        <div className="flex-1" />
        <span className="sub">日期</span>
        <select className="bg-panel-2 border border-line rounded-full px-3 py-1 text-[13px]" value={date ?? ""} onChange={(e) => { setDate(e.target.value || null); setCursor(null); setPlaying(false); }}>
          <option value="">最新</option>
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="seg" role="tablist" aria-label="產業或族群">
          <button role="tab" aria-selected={mode === "ind"} className={mode === "ind" ? "on" : ""} onClick={() => { setMode("ind"); setPick(null); }}>產業</button>
          <button role="tab" aria-selected={mode === "theme"} className={mode === "theme" ? "on" : ""} onClick={() => { setMode("theme"); setPick(null); setCursor(null); }}>族群</button>
        </div>
        <div className="seg">{WINDOWS.map((w) => <button key={w.k} disabled={themeSnapshotOnly && w.k !== 0} className={win === w.k ? "on" : ""} onClick={() => setWin(w.k)}>{w.l}</button>)}</div>
        {mode === "ind" && <div className="flex gap-1.5">
          {GROUPS.map((g) => {
            const on = groups.includes(g);
            return (
              <button key={g} aria-pressed={on} onClick={() => setGroups(on ? (groups.length > 1 ? groups.filter((x) => x !== g) : groups) : [...groups, g])}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] ${on ? "border-line bg-panel-2" : "border-transparent text-dim"}`}>
                <i className="w-2 h-2 rounded-full" style={{ background: on ? GROUP_COLOR[g] : "#3a3f47" }} />{g}
              </button>
            );
          })}
        </div>}
        <div className="flex gap-2">
          <ExportBtn name="即時資金流" target={() => document.querySelector("main")} />
          <button className="btn !px-2.5" title="匯出影片：重播今天的資金流" aria-label="匯出影片" disabled={pts.length < 2 || vprog != null} onClick={exportVideo}>🎬{vprog != null ? ` ${Math.round(vprog * 100)}%` : ""}</button>
        </div>
      </div>
      {day?.note && <div className="rounded-xl border border-[#5a4a24] bg-[#1f1a10] px-3 py-2 text-[13px] text-[var(--gold-2)]">⚠ {day.note}</div>}

      {!day ? (
        <div className="card p-8 text-center text-text-2">{daysResp && (!days.length || data) ? "還沒有任何一天的盤中紀錄。記錄程式會在交易日 09:00–13:30 每 30 秒記一筆，每天存檔。" : <span className="loading">資料載入中…</span>}</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="card px-5 py-4">
              <div className="sub">{mode === "theme" ? "族群合計主動買賣淨額" : "全市場主動買賣淨額"} · {winLabel}</div>
              <div className={`mono text-3xl font-semibold mt-1 ${cls(total)}`}>{yi(total, 1)} <span className="text-[15px]">億</span></div>
            </div>
            <div className="card px-5 py-4">
              <div className="sub">吸金最多</div>
              {best && best.net > 0 && <><div className="text-xl font-semibold mt-1 flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-full" style={{ background: GROUP_COLOR[groupOf(best.k)] }} />{best.k}</div><div className={`mono ${cls(best.net)}`}>{yi(best.net)} <span className="text-[11px]">億</span></div></>}
            </div>
            <div className="card px-5 py-4">
              <div className="sub">失血最多</div>
              {worst && worst.net < 0 && <><div className="text-xl font-semibold mt-1 flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-full" style={{ background: GROUP_COLOR[groupOf(worst.k)] }} />{worst.k}</div><div className={`mono ${cls(worst.net)}`}>{yi(worst.net)} <span className="text-[11px]">億</span></div></>}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
            <div className="card">
              <div className="card-h"><span>資金河道<Help>{mode === "theme" && "族群是整理的概念股清單（一檔可屬於多個族群，合計會重複計算）。"}主動買賣淨額＝外盤成交金額 − 內盤成交金額，依每 30 秒兩次快照之間的成交量與五檔推算（估計值）。河道越粗代表成交越大，點一條看明細。</Help></span><span className="sub">{winLabel}的主動買賣淨額</span></div>
              <div className="grid grid-cols-[120px_1fr_90px] px-5 text-[12px]"><span /><span className="flex justify-center gap-3"><span className="down">流出</span><span className="up">流入</span></span><span /></div>
              <div className="px-3 pb-4">
                {ins.map(riverRow)}
                {ins.length > 0 && outs.length > 0 && <div className="h-4" />}
                {outs.map(riverRow)}
              </div>
              {themeSnapshotOnly && <div className="px-5 pb-2 text-[12px] text-[var(--gold-2)]">今天的紀錄還沒有每 30 秒的族群加總，先用個股全天累計計算；明天開始可以用 5／15／30 分與時間軸回放。</div>}
            </div>

            {sel && (
              <div className="card self-start">
                <div className="card-h">
                  <span className="flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-full" style={{ background: GROUP_COLOR[groupOf(sel.k)] }} />{sel.k}</span>
                  <span className="sub">{sel.k === best?.k ? "吸金最多 · " : sel.k === worst?.k ? "失血最多 · " : ""}點河道換板塊</span>
                </div>
                <div className="px-4 pb-4 grid gap-3">
                  {(() => { const s = stance(sel.dayNet, sel.chg); return <span className={`chip justify-self-start w-fit !text-[13px] ${s.c === "up" ? "!bg-[#3a1518] !text-[var(--up)]" : "!bg-[#11301f] !text-[var(--down)]"}`}>{s.t}</span>; })()}
                  <div className="grid grid-cols-3 gap-2 text-[13px]">
                    <div className="bg-panel-2 rounded-lg p-2.5"><div className="sub">漲跌幅</div><div className={`mono text-[15px] ${cls(sel.chg)}`}>{pct(sel.chg)}</div></div>
                    <div className="bg-panel-2 rounded-lg p-2.5"><div className="sub">全天主動買賣</div><div className={`mono text-[15px] ${cls(sel.dayNet)}`}>{yi(sel.dayNet, 1)} <span className="text-[11px]">億</span></div></div>
                    <div className="bg-panel-2 rounded-lg p-2.5"><div className="sub">全天成交值</div><div className="mono text-[15px]">{sel.dayValue.toFixed(0)} <span className="text-[11px]">億</span></div></div>
                  </div>
                  <div className="bg-panel-2 rounded-lg p-3">
                    <div className="sub mb-1">開盤累積主動買賣淨額 · 到 {pts[idx]?.t.slice(0, 5)}</div>
                    {series.length > 1 ? <NetLine data={series} /> : <div className="h-[120px] flex items-center justify-center sub text-center px-4">{themeSnapshotOnly ? "族群的時間走勢明天開始記錄" : "資料不足"}</div>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <ConsList title="主動買超前五" list={cons.buy} />
                    <ConsList title="主動賣超前五" list={cons.sell} />
                  </div>
                  <div className="text-[11px] text-dim">成分股是最新快照的全天主動買賣淨額（外盤−內盤金額）。</div>
                </div>
              </div>
            )}
          </div>

          <div className="fixed bottom-3 left-0 right-0 z-20 px-3">
            <div className="max-w-[1440px] mx-auto card !rounded-2xl px-4 py-3 flex items-center gap-4 bg-[var(--panel)]/95 backdrop-blur">
              <button className="btn gold !rounded-full w-11 h-11 justify-center !p-0 text-lg" onClick={() => { if (!playing && cursor == null) setCursor(0); setPlaying(!playing); }} aria-label={playing ? "暫停" : "播放"}>{playing ? "❚❚" : "▶"}</button>
              <span className="mono text-xl w-16">{pts[idx]?.t.slice(0, 5)}</span>
              <div className="flex-1 relative pb-4">
                <input type="range" min={0} max={Math.max(0, pts.length - 1)} value={idx < 0 ? 0 : idx} aria-label="時間軸"
                  onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setCursor(v >= pts.length - 1 ? null : v); }} className="w-full accent-[var(--gold)]" />
                {hours.map((h) => <span key={h} className="absolute bottom-0 -translate-x-1/2 sub mono text-[11px]" style={{ left: `${((h - t0) / Math.max(1, tEnd - t0)) * 100}%` }}>{String(h / 3600).padStart(2, "0")}:00</span>)}
              </div>
              <button className={`btn ${cursor == null ? "on" : ""}`} onClick={() => { setCursor(null); setPlaying(false); }}>● 最新</button>
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
        <Link key={x.c} href={`/stock/${x.c}`} className="flex items-center gap-1.5 py-1 rounded hover:bg-panel-2 text-[12.5px]">
          <span className="truncate w-[4.5em]">{x.n}</span>
          <span className={`mono flex-1 ${cls(x.pct)}`}>{pct(x.pct)}</span>
          <span className={`mono ${cls(x.net)}`}>{yi(x.net)}<span className="text-[10px]"> 億</span></span>
        </Link>
      ))}
      {!list.length && <div className="text-[12px] text-dim py-1">沒有</div>}
    </div>
  );
}

/** 開盤累積淨額折線：0 軸虛線、終點圓點、整點時間 */
function NetLine({ data }: { data: { t: string; v: number }[] }) {
  if (data.length < 2) return <div className="h-[120px]" />;
  const W = 340, H = 120, P = 6;
  const vs = data.map((d) => d.v);
  const mx = Math.max(0, ...vs), mn = Math.min(0, ...vs), span = mx - mn || 1;
  const t0 = sec(data[0].t), t1 = Math.max(sec(data[data.length - 1].t), t0 + 1);
  const x = (t: string) => P + ((sec(t) - t0) / (t1 - t0)) * (W - P * 2);
  const y = (v: number) => P + (1 - (v - mn) / span) * (H - P * 2 - 12);
  const d = data.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const last = data[data.length - 1];
  const col = last.v >= 0 ? "#f0505a" : "#22b573";
  const hours = [10, 11, 12, 13].map((h) => `${h}:00:00`).filter((t) => sec(t) > t0 && sec(t) < t1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="#3a3f47" strokeDasharray="3 3" />
      <path d={`${d}L${x(last.t)},${y(0)}L${x(data[0].t)},${y(0)}Z`} fill={col} opacity={0.1} />
      <path d={d} fill="none" stroke={col} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={x(last.t)} cy={y(last.v)} r={3.5} fill={col} />
      {hours.map((t) => <text key={t} x={x(t)} y={H - 1} fontSize={9.5} fill="#646a73" textAnchor="middle">{t.slice(0, 5)}</text>)}
      <text x={P} y={10} fontSize={9.5} fill="#646a73">{mx.toFixed(1)} 億</text>
    </svg>
  );
}
