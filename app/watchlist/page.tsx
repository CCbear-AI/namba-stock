"use client";
import Link from "next/link";
import { Suspense, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BUILTIN, useGroups, useScan } from "@/components/hooks";
import { cls, pct, price, num } from "@/components/fmt";
import Spark from "@/components/Spark";
import Heatmap, { PERIODS, type Period } from "@/components/Heatmap";
import River, { recordRiver, useRankChange, GROUP_COLOR } from "@/components/River";
import ExportBtn from "@/components/ExportBtn";
import StockPicker from "@/components/StockPicker";
import { useSparks } from "@/components/useSparks";
import { builtinCodes } from "@/components/scopes";
import type { ScanRow } from "@/lib/scan";

type View = "list" | "heat" | "river";
const DESC: Record<string, string> = {
  "b-0050": "0050（元大台灣 50）追蹤上市市值前 50 大，這裡依每天市值自動排出前 50 檔；不能手動增減，刪除群組後可以再加回。",
  "b-ath": "今天盤中創上市以來新高的股票，自動更新；不能手動增減。",
  "b-d20": "近 20 個交易日漲幅超過 20% 的股票，自動更新；不能手動增減。",
};

export default function Page() {
  return <Suspense><Watchlist /></Suspense>;
}

function Watchlist() {
  const router = useRouter();
  const sp = useSearchParams();
  const g = useGroups();
  const { data } = useScan();
  const all = useMemo(() => data?.rows ?? [], [data]);
  const byCode = useMemo(() => new Map(all.map((r) => [r.c, r])), [all]);
  const builtins = BUILTIN.filter((b) => !g.hidden.includes(b.id)).map((b) => ({ id: b.id, name: b.name, codes: builtinCodes(b.id, all) }));
  const groups = [...g.groups.slice(0, 1), ...builtins, ...g.groups.slice(1)];
  const [gid, setGid] = useState(sp.get("g") ?? "my");
  const cur = groups.find((x) => x.id === gid) ?? groups[0];
  const isBuiltin = cur.id.startsWith("b-");
  const [view, setView] = useState<View>("list");
  const [sort, setSort] = useState<"custom" | "pct" | "vol">("custom");
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);

  const rows = cur.codes.map((c) => byCode.get(c)).filter((r): r is ScanRow => !!r);
  const sorted = sort === "custom" ? rows : [...rows].sort((a, b) => (sort === "pct" ? b.pct - a.pct : b.vol - a.vol));
  const sparks = useSparks(view === "list" ? sorted.slice(0, 60).map((r) => r.c) : [], "day");
  const move = (from: number, to: number) => {
    if (isBuiltin || from === to) return;
    const c = [...cur.codes]; const [x] = c.splice(from, 1); c.splice(to, 0, x); g.setCodes(cur.id, c);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="card self-start p-3">
        <div className="sub px-1 mb-2">群組</div>
        {groups.map((x) => (
          <button key={x.id} onClick={() => { setGid(x.id); setRenaming(false); }} className={`w-full flex items-center px-3 py-2 rounded-lg text-left ${x.id === cur.id ? "bg-panel-2" : "hover:bg-panel-2/60"}`}>
            <span className="truncate">{x.name}</span><span className="ml-auto sub mono">{x.codes.length}</span>
          </button>
        ))}
        {newName != null ? (
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="群組名稱，按 Enter" className="w-full mt-2 bg-panel-2 border border-[var(--gold)] rounded-lg px-3 py-2 text-[13px] outline-none"
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) { setGid(g.create(newName.trim())); setNewName(null); } if (e.key === "Escape") setNewName(null); }} onBlur={() => setNewName(null)} />
        ) : <button className="w-full mt-2 rounded-lg border border-dashed border-[var(--gold)]/50 text-[var(--gold-2)] py-2 text-[13px]" onClick={() => setNewName("")}>新增群組</button>}
        {g.hidden.length > 0 && <div className="mt-3 sub px-1">已刪除的內建群組：{g.hidden.map((h) => <button key={h} className="chip ml-1 mt-1" onClick={() => g.restore(h)}>＋ {BUILTIN.find((b) => b.id === h)?.name}</button>)}</div>}
        <div className="sub mt-3 px-1">自選股只存在這台裝置。</div>
      </div>

      <div className="card" ref={area}>
        <div className="card-h flex-wrap">
          <div className="flex items-center gap-2">
            {renaming ? <input autoFocus defaultValue={cur.name} className="bg-panel-2 border border-[var(--gold)] rounded px-2 py-1 text-[15px]"
              onKeyDown={(e) => { if (e.key === "Enter") { g.rename(cur.id, e.currentTarget.value.trim() || cur.name); setRenaming(false); } }} onBlur={(e) => { g.rename(cur.id, e.currentTarget.value.trim() || cur.name); setRenaming(false); }} />
              : <span className="text-[17px]">{cur.name}</span>}
            <span className="sub">{cur.codes.length} 檔</span>
            {!isBuiltin && <button data-noexport className="btn !py-0.5" onClick={() => setRenaming(true)}>✎ 改名</button>}
            {cur.id !== "my" && <button data-noexport className="btn !py-0.5" onClick={() => { g.remove(cur.id); setGid("my"); }}>🗑 刪除群組</button>}
          </div>
          <div className="flex flex-wrap items-center gap-2" data-noexport>
            <div className="seg">{([["list", "列表"], ["heat", "熱力圖"], ["river", "河道"]] as const).map(([k, l]) => <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}</div>
            {view === "list" && <div className="seg">{([["custom", "自訂順序"], ["pct", "漲跌幅"], ["vol", "成交量"]] as const).map(([k, l]) => <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{l}</button>)}</div>}
            <ExportBtn name={cur.name} target={() => area.current} />
            {!isBuiltin && <button className="btn" onClick={() => setAdding(!adding)}>加入股票</button>}
          </div>
        </div>
        {isBuiltin && <div className="px-4 pb-2 sub">{DESC[cur.id]}</div>}
        {adding && !isBuiltin && <div className="px-4 pb-3" data-noexport><StockPicker autoFocus onPick={(c) => g.add(cur.id, [c])} placeholder="輸入代號或名稱，按 Enter 加入" /></div>}

        {view === "list" && (
          <div className="overflow-x-auto px-2 pb-2">
            <table className="tbl">
              <thead><tr><th>股票</th><th>當日走勢</th><th>近 20 日走勢</th><th>成交價</th><th>漲跌</th><th>漲跌幅</th><th>成交量 (張)</th><th>{rows[0]?.chipDate ? rows[0].chipDate.slice(5).replace("-", "/") : ""} 外資 (張)</th><th>投信 (張)</th><th data-noexport>操作</th></tr></thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.c} className="click" draggable={sort === "custom" && !isBuiltin}
                    onDragStart={() => (drag.current = i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag.current != null) move(drag.current, i); drag.current = null; }}
                    onClick={() => router.push(`/stock/${r.c}`)}>
                    <td>{sort === "custom" && !isBuiltin && <span className="text-dim mr-1 cursor-grab" title="拖曳調整順序">⋮⋮</span>}<span className="mono text-text-2 mr-2">{r.c}</span>{r.n}</td>
                    <td><Spark data={sparks[r.c] ?? []} base={r.prev} /></td>
                    <td><Spark data={r.c20} /></td>
                    <td className={`mono ${cls(r.chg)}`}>{price(r.price)}</td>
                    <td className={`mono ${cls(r.chg)}`}>{r.chg > 0 ? "+" : ""}{price(r.chg)}</td>
                    <td className={`mono ${cls(r.pct)}`}>{pct(r.pct)}</td>
                    <td className="mono">{num(r.vol)}</td>
                    <td className={`mono ${cls(r.f1)}`}>{r.f1 > 0 ? "+" : ""}{num(r.f1)}</td>
                    <td className={`mono ${cls(r.t1)}`}>{r.t1 > 0 ? "+" : ""}{num(r.t1)}</td>
                    <td data-noexport onClick={(e) => e.stopPropagation()} className="whitespace-nowrap">
                      <Link href={`/alerts?code=${r.c}`} className="btn !py-0.5 mr-1">提醒</Link>
                      {!isBuiltin && <button className="btn !py-0.5" onClick={() => g.setCodes(cur.id, cur.codes.filter((x) => x !== r.c))}>移除</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!cur.codes.length && <div className="sub text-center py-10">{isBuiltin ? "目前沒有符合的股票" : "這個群組還沒有股票，按右上「加入股票」。"}</div>}
          </div>
        )}
        {view === "heat" && <HeatView rows={rows} />}
        {view === "river" && <RiverView rows={rows} title={cur.name} />}
      </div>
    </div>
  );
}

function HeatView({ rows }: { rows: ScanRow[] }) {
  const [period, setPeriod] = useState<Period>("d");
  const [size, setSize] = useState<"equal" | "cap" | "value">("equal");
  return (
    <div className="px-4 pb-4">
      <div className="flex flex-wrap gap-3 mb-3" data-noexport>
        <div className="seg">{PERIODS.map((p) => <button key={p.k} className={period === p.k ? "on" : ""} onClick={() => setPeriod(p.k)}>{p.l}</button>)}</div>
        <span className="sub self-center">面積</span>
        <div className="seg">{([["equal", "等大"], ["cap", "市值"], ["value", "成交值"]] as const).map(([k, l]) => <button key={k} className={size === k ? "on" : ""} onClick={() => setSize(k)}>{l}</button>)}</div>
      </div>
      <Heatmap rows={rows} period={period} sizeBy={size} byIndustry={false} minH={360} />
    </div>
  );
}

const SPAN: { k: "d" | 5 | 20 | 30; l: string }[] = [{ k: "d", l: "當日" }, { k: 5, l: "近 5 日" }, { k: 20, l: "近 20 日" }, { k: 30, l: "近 30 日" }];
function RiverView({ rows, title }: { rows: ScanRow[]; title: string }) {
  const [span, setSpan] = useState<"d" | 5 | 20 | 30>("d");
  const [win, setWin] = useState<0 | 30 | 15 | 5>(0);
  const [prog, setProg] = useState<number | null>(null);
  const codes = rows.slice(0, 60).map((r) => r.c);
  const intra = useSparks(span === "d" ? codes : [], "day");
  const daily = useSparks(span !== "d" ? codes : [], 31);
  const val = (r: ScanRow) => {
    if (span !== "d") { const c = daily[r.c]; return c && c.length > span ? (r.price / c[c.length - 1 - span] - 1) * 100 : 0; }
    if (!win) return r.pct;
    const s = intra[r.c]; const k = Math.round(win / 3);
    return s && s.length > k ? (s[s.length - 1] / s[s.length - 1 - k] - 1) * 100 : 0;
  };
  const list = rows.map((r) => ({ c: r.c, n: r.n, ind: r.ind, v: Math.round(val(r) * 100) / 100 })).sort((a, b) => b.v - a.v);
  const chg = useRankChange(list.map((x) => x.c));
  const avg = list.length ? list.reduce((s, x) => s + x.v, 0) / list.length : 0;

  const exportVideo = async () => {
    const names = new Map(rows.map((r) => [r.c, { n: r.n, ind: r.ind }]));
    const frames: { t: string; v: Record<string, number> }[] = [];
    if (span === "d") {
      const len = Math.max(0, ...codes.map((c) => intra[c]?.length ?? 0));
      for (let i = 0; i < len; i++) {
        const m = 9 * 60 + i * 3;
        frames.push({ t: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, v: Object.fromEntries(rows.map((r) => { const s = intra[r.c]; const x = s?.[Math.min(i, s.length - 1)]; return [r.c, x && r.prev ? ((x - r.prev) / r.prev) * 100 : 0]; })) });
      }
    } else {
      for (let i = span; i >= 0; i--) frames.push({ t: i ? `${i} 日前` : "今天", v: Object.fromEntries(rows.map((r) => { const c = daily[r.c]; if (!c || c.length <= span) return [r.c, 0]; const base = c[c.length - 1 - span], x = i ? c[c.length - 1 - i] : r.price; return [r.c, (x / base - 1) * 100]; })) });
    }
    if (frames.length < 2) return;
    setProg(0);
    const blob = await recordRiver(`${title} · 河道`, names, frames, setProg);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title}-河道.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
    a.click();
    setTimeout(() => setProg(null), 1500);
  };

  return (
    <div className="px-4 pb-4">
      <div className="flex flex-wrap items-center gap-3 mb-3" data-noexport>
        <div className="seg">{SPAN.map((s) => <button key={s.k} className={span === s.k ? "on" : ""} onClick={() => setSpan(s.k)}>{s.l}</button>)}</div>
        {span === "d" && <div className="seg">{([[0, "全天"], [30, "30 分"], [15, "15 分"], [5, "5 分"]] as const).map(([k, l]) => <button key={k} className={win === k ? "on" : ""} onClick={() => setWin(k)}>{l}</button>)}</div>}
        <button className="btn" onClick={exportVideo} disabled={prog != null}>🎬 {prog != null ? `${Math.round(prog * 100)}%` : "匯出影片"}</button>
        <span className="ml-auto flex gap-3 sub">{Object.entries(GROUP_COLOR).map(([k, c]) => <span key={k}><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: c }} />{k}</span>)}</span>
      </div>
      <div className="grid grid-cols-3 gap-px bg-line rounded-lg overflow-hidden mb-3">
        <div className="bg-panel px-4 py-3"><div className="sub">群組平均</div><div className={`mono text-2xl ${cls(avg)}`}>{pct(avg)}</div></div>
        <div className="bg-panel px-4 py-3"><div className="sub">漲最多</div>{list[0] && <div>{list[0].n} <span className={`mono ${cls(list[0].v)}`}>{pct(list[0].v)}</span></div>}</div>
        <div className="bg-panel px-4 py-3"><div className="sub">跌最多</div>{list.at(-1) && <div>{list.at(-1)!.n} <span className={`mono ${cls(list.at(-1)!.v)}`}>{pct(list.at(-1)!.v)}</span></div>}</div>
      </div>
      <River rows={list.map((x) => ({ ...x, rankChg: chg.get(x.c) }))} />
    </div>
  );
}
