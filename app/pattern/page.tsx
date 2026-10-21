"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePoll, useRecent, useScan, useWatchlist } from "@/components/hooks";
import StockPicker, { NAME } from "@/components/StockPicker";
import { cls, pct, price } from "@/components/fmt";

type Item = { c: string; n: string; sim: number; pct?: number; last: number; spark: number[]; from?: string; to?: string; after?: (number | null)[] };
type Res = {
  error?: string; code: string; name: string; from: string; to: string; a: number; b: number; n: number; pct: number; spark: number[];
  history: { dates: string[]; closes: (number | null)[] }; list: Item[]; stat?: ({ avg: number; up: number; n: number } | null)[];
};
const SPANS = [10, 20, 40, 60, 120];
const md = (d?: string) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");

export default function Page() {
  return <Suspense><Pattern /></Suspense>;
}

function Pattern() {
  const sp = useSearchParams();
  const recent = useRecent();
  const wl = useWatchlist();
  const { data: scan } = useScan(60_000);
  const [code, setCode] = useState(sp.get("code") ?? "0050");
  const [n, setN] = useState(20);
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(sp.get("from") && sp.get("to") ? { from: sp.get("from")!, to: sp.get("to")! } : null);
  const [mode, setMode] = useState<"now" | "hist">("now");
  useEffect(() => { recent.push(code); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = custom ? `from=${custom.from}&to=${custom.to}` : `n=${n}`;
  const { data } = usePoll<Res>(`/api/pattern?code=${code}&${q}&mode=${mode}`);
  const live = scan?.rows.find((r) => r.c === code);
  const ok = data && !data.error && data.code === code;

  return (
    <div className="grid gap-4">
      <div className="flex items-baseline gap-3"><h1 className="text-lg font-bold">相似股</h1><span className="sub">搜尋一檔股票、選一段走勢，到全市場排出形狀最像的股票</span></div>
      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        <div className="card p-4 self-start">
          <StockPicker onPick={(c) => { setCode(c); setCustom(null); }} />
          <div className="flex flex-wrap items-center gap-2 mt-3 sub">最近看過 {recent.list.filter((c) => c !== code).slice(0, 6).map((c) => <button key={c} className="chip" onClick={() => { setCode(c); setCustom(null); }}>{NAME.get(c) ?? c}</button>)}</div>
          <div className="flex items-start mt-4">
            <div>
              <div className="text-xl font-bold">{NAME.get(code) ?? code} <span className="mono text-text-2 text-[14px]">{code}</span></div>
              {live && <div className={`mono ${cls(live.chg)}`}>{price(live.price)} {pct(live.pct)}</div>}
            </div>
            <Link href={`/stock/${code}`} className="btn ml-auto">看個股</Link>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <span className="sub">比對最近</span>
            <div className="seg">{SPANS.map((k) => <button key={k} className={!custom && n === k ? "on" : ""} onClick={() => { setN(k); setCustom(null); }}>{k} 日</button>)}</div>
          </div>
          {ok ? <SelectChart res={data} onSelect={(from, to) => setCustom({ from, to })} /> : <div className="h-[340px] flex items-center justify-center sub">{data?.error ?? <span className="loading">載入中…</span>}</div>}
          <div className="sub mt-2">在圖上按住拖曳可以自己選一段（5–120 根），放開就重新比對</div>
        </div>

        <div className="card self-start">
          <div className="card-h">相似度排行 {ok && <span className="sub">以 {data.name} {data.n} 根比對</span>}</div>
          <div className="px-4">
            <div className="seg w-full grid grid-cols-2"><button className={mode === "now" ? "on" : ""} onClick={() => setMode("now")}>正在形成</button><button className={mode === "hist" ? "on" : ""} onClick={() => setMode("hist")}>歷史相似</button></div>
            <p className="sub mt-3 leading-relaxed">{mode === "now" ? "全市場最近這幾天的走勢，跟你框的形狀最像的股票（還在形成中，之後怎麼走沒人知道）。" : "今年以來全市場出現過的相似型態，以及它們之後 5／10／20 個交易日怎麼走。"}</p>
            {mode === "hist" && ok && data.stat && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {["5 日後平均", "10 日後平均", "20 日後平均"].map((l, k) => {
                  const s = data.stat![k];
                  return <div key={l} className="rounded-lg bg-panel-2 px-3 py-2"><div className="sub">{l}</div><div className={`mono text-lg ${cls(s?.avg ?? 0)}`}>{s ? pct(s.avg) : "—"}</div><div className="sub">{s ? `上漲 ${s.up}%` : "資料不足"}</div></div>;
                })}
              </div>
            )}
            <div className="flex items-center mt-3"><span className="sub">共 {ok ? data.list.length : 0} 檔</span>
              {ok && <button className="btn ml-auto" onClick={() => wl.addMany(data.list.map((x) => x.c))}>☆ 全部加入自選</button>}</div>
          </div>
          <div className="scroll-y max-h-[640px] px-2 py-2">
            {ok && data.list.map((x, i) => (
              <div key={x.c} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-panel-2">
                <span className="mono sub w-5">{i + 1}</span>
                <Link href={`/stock/${x.c}`} className="flex-1 min-w-0">
                  <div className="truncate">{x.n} <span className="mono text-text-2 text-[12px]">{x.c}</span></div>
                  <div className="sub mono">{md(x.from ?? data.from)} – {md(x.to ?? data.to)} · {price(x.last)}</div>
                </Link>
                <Overlay a={data.spark} b={x.spark} n={data.n} />
                <div className="w-16 text-right">
                  <div className="mono">{x.sim}<span className="sub">%</span></div>
                  <div className="h-1 bg-panel-2 rounded"><div className="h-full bg-[var(--gold)] rounded" style={{ width: `${x.sim}%` }} /></div>
                  {mode === "now" ? <div className={`mono text-[12px] ${cls(x.pct ?? 0)}`}>{pct(x.pct ?? 0)}</div> : <div className={`mono text-[12px] ${cls(x.after?.[1] ?? 0)}`}>10日 {x.after?.[1] != null ? pct(x.after[1]) : "—"}</div>}
                </div>
                <button className={`w-6 ${wl.has(x.c) ? "text-[var(--gold)]" : "text-text-2"}`} aria-label={wl.has(x.c) ? "已在自選" : "加入自選"} onClick={() => wl.toggle(x.c)}>{wl.has(x.c) ? "✓" : "☆"}</button>
              </div>
            ))}
            {ok && !data.list.length && <div className="sub text-center py-8">找不到夠像的（相似度 {mode === "now" ? "60" : "80"}% 以上）</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 目標（灰）與候選（綠）疊在一起；歷史相似的候選後面多畫 10 天 */
function Overlay({ a, b, n }: { a: number[]; b: number[]; n: number }) {
  const W = 110, H = 34;
  const path = (v: number[], len: number) => v.map((y, i) => `${i ? "L" : "M"}${((i / (len - 1)) * (W * (len / Math.max(len, n)) - 2)).toFixed(1)},${(H - 2 - y * (H - 4)).toFixed(1)}`).join("");
  const len = Math.max(b.length, n);
  return (
    <svg width={W} height={H} aria-hidden="true">
      <path d={path(a, len)} fill="none" stroke="#9aa0a8" strokeWidth={1.2} />
      <path d={path(b.slice(0, n), len)} fill="none" stroke="#22b573" strokeWidth={1.4} />
      {b.length > n && <path d={path(b, len).split("L").slice(0).join("L")} fill="none" stroke="#22b57355" strokeWidth={1} strokeDasharray="2 2" />}
    </svg>
  );
}

/** 歷史收盤折線，可拖曳框選一段 */
function SelectChart({ res, onSelect }: { res: Res; onSelect: (from: string, to: string) => void }) {
  const box = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ s: number; e: number } | null>(null);
  const live = useRef<{ s: number; e: number } | null>(null); // 拖曳中的起訖（事件裡即時讀寫）
  const pts = useMemo(() => res.history.closes.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v != null), [res]);
  const W = 640, H = 340, PAD = 40;
  const N = res.history.dates.length;
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  const x = (i: number) => (i / Math.max(1, N - 1)) * (W - PAD);
  const y = (v: number) => H - 20 - ((v - lo) / (hi - lo || 1)) * (H - 40);
  const idx = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return Math.max(0, Math.min(N - 1, Math.round((((clientX - r.left) / r.width) * W / (W - PAD)) * (N - 1))));
  };
  const sel = drag ? { a: Math.min(drag.s, drag.e), b: Math.max(drag.s, drag.e) } : { a: res.a, b: res.b };
  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + (hi - lo) * t);
  const lx = Math.max(0, Math.min(x(sel.a), W - PAD - 170)); // 標籤不要超出右邊
  return (
    <svg ref={box} viewBox={`0 0 ${W} ${H}`} className="w-full mt-3 select-none touch-none cursor-crosshair"
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); const i = idx(e.clientX); live.current = { s: i, e: i }; setDrag(live.current); }}
      onPointerMove={(e) => { if (live.current) { live.current = { ...live.current, e: idx(e.clientX) }; setDrag(live.current); } }}
      onPointerUp={(e) => {
        const d = live.current;
        live.current = null;
        setDrag(null);
        if (d) {
          const end = idx(e.clientX), a = Math.min(d.s, end), b = Math.max(d.s, end);
          if (b - a >= 4 && b - a <= 119) onSelect(res.history.dates[a], res.history.dates[b]);
        }
      }}>
      {ticks.map((t) => <g key={t}><line x1={0} x2={W - PAD} y1={y(t)} y2={y(t)} stroke="#1b1e23" /><text x={W - PAD + 4} y={y(t) + 4} fill="#646a73" fontSize={10}>{price(t)}</text></g>)}
      <rect x={x(sel.a)} y={10} width={Math.max(2, x(sel.b) - x(sel.a))} height={H - 30} fill="#d9b45a22" stroke="#d9b45a" />
      <path d={d} fill="none" stroke="#c9c9c9" strokeWidth={1.2} />
      <rect x={lx} y={0} width={170} height={16} rx={3} fill="#d9b45a" />
      <text x={lx + 4} y={12} fontSize={10.5} fill="#1b1608">{sel.b - sel.a + 1} 根 · {md(res.history.dates[sel.a])} – {md(res.history.dates[sel.b])}{!drag && ` · ${pct(res.pct)}`}</text>
    </svg>
  );
}
