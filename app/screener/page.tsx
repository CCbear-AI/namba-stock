"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useScan, useWatchlist } from "@/components/hooks";
import { useRules } from "@/components/alerts";
import { cls, pct, price, num, hm } from "@/components/fmt";
import { CONDS, COND, STRATEGIES, matchAll, hiTag } from "@/lib/conditions";

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
  const strategy = STRATEGIES.find((s) => s.conds.length === conds.length && s.conds.every((c) => conds.includes(c)));
  const toggle = (id: string) => setConds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const key = [...conds].sort().join(",");
  const alertRule = rules.find((r) => r.kind === "strategy" && [...(r.conds ?? [])].sort().join(",") === key);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="card self-start lg:sticky lg:top-28 flex flex-col max-h-[calc(100vh-8rem)]">
        <div className="card-h text-[16px]">飆股選股器</div>
        <div className="px-4 sub">快速策略</div>
        <div className="grid grid-cols-2 gap-2 p-4 pt-2">
          {STRATEGIES.map((s) => <button key={s.id} className={`btn justify-center ${strategy?.id === s.id ? "on" : ""}`} onClick={() => setConds(s.conds)}>{s.label}</button>)}
        </div>
        <div className="px-4 flex items-center sub">篩選條件（全部符合）<button className="ml-auto text-[var(--gold)]" onClick={() => setConds([])}>清除</button></div>
        <div className="scroll-y flex-1 px-2 py-1">
          {CONDS.map((c) => (
            <label key={c.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-panel-2 cursor-pointer">
              <input type="checkbox" checked={conds.includes(c.id)} onChange={() => toggle(c.id)} className="accent-[var(--gold)] w-4 h-4" />
              <span className="flex-1 text-[13px]">{c.label}</span>
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
          <span>符合 <span className="text-[var(--gold-2)] mono">{hits.length}</span> 檔 <span className="sub ml-2">掃描範圍：上市櫃全部個股 · 依漲跌幅排序</span></span>
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
            <thead><tr>{multi && <th className="w-8"></th>}<th>股票</th><th>成交價</th><th>漲跌幅</th><th>量比</th><th>成交量 (張)</th><th>外資連買</th><th>投信連買</th><th>均線 / 新高</th><th>操作</th></tr></thead>
            <tbody>
              {hits.map((r) => (
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
          篩選結果不構成投資建議 · 量比 = 今日成交量 ÷ 近 5 日均量<br />
          RVOL = 同時段相對成交量，依加權指數盤中量能曲線估算到此刻該有的量；收盤後即今日量 ÷ 20 日均量<br />
          創新高＝收盤 ≥ 前 N 日最高收盤 · 創新低＝收盤 ≤ 前 N 日最低收盤 · 均線多頭排列＝5 日線 ＞ 20 日線 ＞ 60 日線<br />量價齊揚 = RVOL ≥ 1.5、推進效率 ≥ 1、今日上漲（推進效率＝今日漲跌幅 ÷ 近 20 日平均日漲跌幅 ÷ RVOL） · 爆量沒推進 = RVOL ≥ 2 但漲跌不到近 20 日平均每日漲跌幅的三成 · <Link href="/alerts" className="text-[var(--gold)]">管理提醒</Link>
        </div>
      </div>
    </div>
  );
}
