"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePoll, useScan, useWatchlist } from "@/components/hooks";
import { useRules } from "@/components/alerts";
import { cls, pct, price, num, hm } from "@/components/fmt";
import { CONDS, COND, STRATEGIES, matchAll, hiTag } from "@/lib/conditions";
import Help, { Term } from "@/components/Help";
import { VR_HELP, SCREENER_HELP, COND_HELP } from "@/components/glossary";

type Rank = { error?: string; date: string; rows: { c: string; pctile: number; conc: number; tags: string[] }[]; skip: { c: string; conc: number; tags: string[] }[] };
const CONC_HELP = "收盤後的分點排序：前五大賣家（賣超最多的 5 家分點）合計佔當天成交量，先扣掉規模、漲跌、波動、位置、量能等 11 個價量因素，再看在全市場同一天排第幾個百分位（越高＝賣方越集中，常是大戶在出）。短線漲多（近 5 日漲 10% 以上或近 20 日漲 25% 以上）的不排序、排在最後；高波動（近 20 日波動在全市場前 25%）只提醒。成交值太小的股票沒有分點資料。只幫你排先後，不是買賣建議。";

export default function Page() {
  return <Suspense><Screener /></Suspense>;
}

function Screener() {
  const sp = useSearchParams();
  const router = useRouter();
  const { data } = useScan();
  const wl = useWatchlist();
  const { rules, add, remove } = useRules();
  const [conds, setConds] = useState<string[]>(sp.get("c")?.split(",").filter((c) => COND[c]) ?? STRATEGIES[0].conds);
  const [multi, setMulti] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.vol > 0), [data]);
  const counts = useMemo(() => Object.fromEntries(CONDS.map((c) => [c.id, rows.filter(c.test).length])), [rows]);
  const hits = useMemo(() => rows.filter((r) => matchAll(r, conds)).sort((a, b) => b.pct - a.pct), [rows, conds]);
  const [sort, setSort] = useState<"pct" | "conc">(sp.get("sort") === "conc" ? "conc" : "pct");
  // 依賣方集中度排：符合的股票（最多 300 檔）拿去問分點排序，代號排好避免每次掃描更新都換網址
  const rankCodes = sort === "conc" ? hits.slice(0, 300).map((r) => r.c).sort().join(",") : "";
  const { data: rank } = usePoll<Rank>(rankCodes ? `/api/brokers?view=rank&codes=${rankCodes}` : null);
  const rk = useMemo(() => {
    const m = new Map<string, { pctile: number | null; tags: string[] }>();
    for (const r of rank?.rows ?? []) m.set(r.c, r);
    for (const r of rank?.skip ?? []) m.set(r.c, { pctile: null, tags: r.tags });
    return m;
  }, [rank]);
  const shown = useMemo(() => {
    if (sort !== "conc" || !rank) return hits;
    const v = (c: string) => { const x = rk.get(c); return !x ? -2 : x.pctile ?? -1; };
    return [...hits].sort((a, b) => v(b.c) - v(a.c));
  }, [hits, sort, rank, rk]);
  const strategy = STRATEGIES.find((s) => s.conds.length === conds.length && s.conds.every((c) => conds.includes(c)));
  const toggle = (id: string) => setConds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const key = [...conds].sort().join(",");
  const alertRule = rules.find((r) => r.kind === "strategy" && [...(r.conds ?? [])].sort().join(",") === key);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="card self-start lg:sticky lg:top-28 flex flex-col max-h-[calc(100vh-8rem)]">
        <div className="card-h text-[16px]">條件選股</div>
        <div className="px-4 sub">快速策略</div>
        <div className="grid grid-cols-2 gap-2 p-4 pt-2">
          {STRATEGIES.map((s) => <button key={s.id} className={`btn justify-center ${strategy?.id === s.id ? "on" : ""}`} onClick={() => setConds(s.conds)}>{s.label}</button>)}
        </div>
        <div className="px-4 flex items-center sub">篩選條件（全部符合）<Help>{SCREENER_HELP}</Help><button className="ml-auto text-[var(--gold)]" onClick={() => setConds([])}>清除</button></div>
        <div className="scroll-y flex-1 px-2 py-1">
          {CONDS.map((c) => (
            <label key={c.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-panel-2 cursor-pointer">
              <input type="checkbox" checked={conds.includes(c.id)} onChange={() => toggle(c.id)} className="accent-[var(--gold)] w-4 h-4" />
              <span className="flex-1 text-[13px]">{COND_HELP[c.id] ? <Term tip={COND_HELP[c.id]}>{c.label}</Term> : c.label}</span>
              <span className="sub mono">{counts[c.id]?.toLocaleString() ?? "—"} 檔</span>
            </label>
          ))}
        </div>
        <div className="border-t border-line p-3">
          <button className={`btn w-full justify-center ${alertRule ? "on" : ""}`} disabled={!conds.length}
            onClick={() => (alertRule ? remove(alertRule.id) : add({ kind: "strategy", conds: [...conds], label: strategy?.label }))}>
            {alertRule ? "🔔 已是現有策略，有新符合就提醒（按一下取消）" : "🔔 有新符合就提醒"}
          </button>
        </div>
      </div>

      <div className="card self-start">
        <div className="card-h">
          <span>符合 <span className="text-[var(--gold-2)] mono">{hits.length}</span> 檔 <span className="sub ml-2">掃描範圍：上市櫃全部個股 · 排序</span>
            <span className="seg ml-1 align-middle">{([["pct", "漲跌幅"], ["conc", "賣方集中度"]] as const).map(([k, l]) => <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{l}</button>)}</span>
            {sort === "conc" && <Help>{CONC_HELP}</Help>}
            {sort === "conc" && rank && !rank.error && <span className="sub ml-2">{rank.date.slice(5).replace("-", "/")} 收盤分點</span>}
          </span>
          <span className="sub">更新於 {data ? `${new Date(data.time + 8 * 3600e3).toISOString().slice(5, 10).replace("-", "/")} ${hm(data.time)}` : "—"}
            <button className="ml-3 text-[var(--gold)]" onClick={() => { setMulti(!multi); setSel([]); }}>{multi ? "完成" : "多選"}</button>
          </span>
        </div>
        {multi && (
          <div className="px-4 pb-2 flex items-center gap-3 text-[13px]">
            <button className="sub hover:text-text" onClick={() => setSel(sel.length === hits.length ? [] : hits.map((r) => r.c))}>{sel.length === hits.length && hits.length ? "全不選" : "全選"}</button>
            <span>已選 {sel.length} 檔</span>
            <button className="btn gold" disabled={!sel.length} onClick={() => { wl.addMany(sel); setSel([]); }}>加入自選</button>
            <button className="btn" disabled={!sel.length} onClick={() => router.push(`/multi?codes=${sel.slice(0, 9).join(",")}`)}>多股比較</button>
          </div>
        )}
        <div className="overflow-x-auto px-2 pb-2">
          <table className="tbl">
            <thead><tr>{multi && <th className="w-8"></th>}<th>股票</th><th>成交價</th><th>漲跌幅</th><th><Term tip={VR_HELP}>量比</Term></th><th>成交量 (張)</th><th>外資連買</th><th>投信連買</th><th>均線 / 新高</th>{sort === "conc" && <th>賣方集中度</th>}<th>操作</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.c} className="click" onClick={() => (multi ? setSel((s) => (s.includes(r.c) ? s.filter((x) => x !== r.c) : [...s, r.c])) : router.push(`/stock/${r.c}`))}>
                  {multi && <td><input type="checkbox" readOnly checked={sel.includes(r.c)} aria-label={`選取 ${r.n}`} /></td>}
                  <td><span className="mono text-text-2 mr-2">{r.c}</span>{r.n}</td>
                  <td className={`mono ${cls(r.chg)}`}>{price(r.price)}</td>
                  <td className={`mono ${cls(r.pct)}`}>{pct(r.pct)}</td>
                  <td className="mono">{r.vr.toFixed(1)}x</td>
                  <td className="mono">{num(r.vol)}</td>
                  <td className="mono">{r.fDays > 0 ? `${r.fDays} 日` : "—"}</td>
                  <td className="mono">{r.tDays > 0 ? `${r.tDays} 日` : "—"}</td>
                  <td>{hiTag(r) || "—"}</td>
                  {sort === "conc" && <td>{!rank ? <span className="sub loading">…</span> : (() => {
                    const x = rk.get(r.c);
                    if (!x) return <span className="sub">沒資料</span>;
                    return <div className="flex items-center gap-2 justify-end whitespace-nowrap">
                      {x.tags.map((t) => <span key={t} className="chip !bg-panel-2 !text-text-2">{t}</span>)}
                      {x.pctile == null ? <span className="sub">不排序</span> : <><div className="w-16 h-1.5 rounded bg-panel-2"><div className="h-full rounded bg-[var(--gold)]" style={{ width: `${x.pctile}%` }} /></div><span className="mono w-6">{x.pctile}</span></>}
                    </div>;
                  })()}</td>}
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className={`btn !py-0.5 ${wl.has(r.c) ? "on" : ""}`} onClick={() => wl.toggle(r.c)}>{wl.has(r.c) ? "已在自選" : "加入自選"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !hits.length && <div className="sub text-center py-10">{conds.length ? "目前沒有股票同時符合這些條件" : "勾選左邊的條件開始選股"}</div>}
          {!data && <div className="sub text-center py-10 loading">正在掃描上市櫃全部個股…</div>}
        </div>
        <div className="px-4 pb-4 sub leading-relaxed">
          篩選結果不構成投資建議 · 條件定義請看左邊「篩選條件」旁的問號 · <Link href="/alerts" className="text-[var(--gold)]">管理提醒</Link>
        </div>
      </div>
    </div>
  );
}
