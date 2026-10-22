"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGroups, useScan } from "@/components/hooks";
import { cls, pct, price, hm } from "@/components/fmt";
import Spark from "@/components/Spark";
import MiniChart from "@/components/MiniChart";
import { useSparks } from "@/components/useSparks";
import { scopes } from "@/components/scopes";
import type { ScanRow } from "@/lib/scan";
import Help, { Term } from "@/components/Help";
import { VR_HELP } from "@/components/glossary";

type P = "d" | 5 | 20 | 60;
const PL: Record<string, string> = { d: "當日", 5: "近5日", 20: "近20日", 60: "近60日" };
const val = (r: ScanRow, p: P) => (p === "d" ? r.pct : p === 5 ? r.d5 : p === 20 ? r.d20 : r.d60);

export default function Gainers() {
  const router = useRouter();
  const { data } = useScan();
  const g = useGroups();
  const [p, setP] = useState<P>("d");
  const [scope, setScope] = useState("all");
  const [minVal, setMinVal] = useState(0);
  const [q, setQ] = useState("");
  const [show, setShow] = useState(20);
  const [lockOrder, setLockOrder] = useState<string[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);

  const all = useMemo(() => data?.rows ?? [], [data]);
  const sc = useMemo(() => scopes(all, g.groups), [all, g.groups]);
  const list = useMemo(() => {
    const f = sc.find((s) => s.id === scope) ?? sc[0];
    const s = q.trim();
    // 跟里長伯一樣只列有上漲的
    let rows = f.filter(all).filter((r) => (p === "d" ? r.vol > 0 : true) && Number.isFinite(val(r, p)) && val(r, p) > 0 && r.value >= minVal && (!s || r.c.startsWith(s) || r.n.includes(s)));
    rows = rows.sort((a, b) => val(b, p) - val(a, p) || b.value - a.value);
    if (lockOrder) {
      // 鎖定排序：維持鎖定當下的順序，只更新數字
      const order = new Map(lockOrder.map((c, i) => [c, i]));
      rows = rows.filter((r) => order.has(r.c)).sort((a, b) => order.get(a.c)! - order.get(b.c)!);
    }
    return rows;
  }, [all, sc, scope, q, p, minVal, lockOrder]);

  const visible = list.slice(0, show);
  const sparks = useSparks(visible.map((r) => r.c), p === "d" ? "day" : p);
  const maxAbs = Math.max(1, ...visible.map((r) => Math.abs(val(r, p))));
  const top = list[0];
  const cur = all.find((r) => r.c === (focus ?? top?.c));
  const toggleSel = (c: string) => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c].slice(-9)));

  return (
    <div className="grid gap-4">
      <div className="flex items-end gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Noto Serif TC', serif" }}>漲幅排行</h1>
          <p className="sub mt-1">先看漲幅，再看走勢。把值得追蹤的股票放在一起。</p>
        </div>
        <span className="ml-auto sub">● {data?.open ? "即時" : "收盤"} {data ? hm(data.time) : ""}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-y border-line py-3">
        <div className="seg">{(["d", 5, 20, 60] as P[]).map((k) => <button key={k} className={p === k ? "on" : ""} onClick={() => setP(k)}>{PL[k]}</button>)}</div>
        <label className="sub flex items-center gap-2">範圍
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="bg-panel-2 border border-line rounded-lg px-3 py-1.5 text-[13px] text-text">
            {sc.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="sub flex items-center gap-2">成交值
          <select value={minVal} onChange={(e) => setMinVal(Number(e.target.value))} className="bg-panel-2 border border-line rounded-lg px-3 py-1.5 text-[13px] text-text">
            <option value={0}>不限</option><option value={1}>至少 1 億</option><option value={5}>至少 5 億</option><option value={10}>至少 10 億</option>
          </select>
        </label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="代號或股票名稱" className="ml-auto w-56 bg-panel-2 border border-line rounded-lg px-3 py-1.5 text-[13px] outline-none focus:border-[var(--gold)]" />
      </div>
      <div className="flex items-center gap-4">
        <span className="mono text-xl font-semibold">{list.length.toLocaleString()}</span><span className="sub">檔符合</span>
        {top && <span className="sub">領漲 <b className="text-text">{top.n}</b> <span className={`mono ${cls(val(top, p))}`}>{pct(val(top, p))}</span></span>}
        <span className="ml-auto sub inline-flex items-center">計算方式<Help align="right">只列上漲的股票；{p === "d" ? "漲幅以昨收為基準。" : `對比 ${p} 個交易日前收盤，未還原除權息。`}</Help></span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="card">
          <div className="card-h">
            <span>{PL[p]}漲幅排行 <span className="chip ml-1">{list.length.toLocaleString()}</span><div className="sub mt-1">漲幅由高到低，同幅度依成交值排序</div></span>
            <button className={`btn ${lockOrder ? "on" : ""}`} onClick={() => setLockOrder(lockOrder ? null : list.map((r) => r.c))}>{lockOrder ? "已鎖定排序" : "鎖定排序"}</button>
          </div>
          <div className="px-2 pb-2 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th className="w-8"></th><th className="!text-left w-8">#</th><th className="!text-left">股票</th><th className="!text-left">{PL[p]}漲幅</th><th>股價</th><th>今日成交值</th><th>{PL[p]}走勢</th></tr></thead>
              <tbody>
                {visible.map((r, i) => {
                  const v = val(r, p);
                  return (
                    <tr key={r.c} className={`click ${focus === r.c ? "bg-panel-2" : ""}`} onClick={() => setFocus(r.c)} onDoubleClick={() => router.push(`/stock/${r.c}`)}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`選取 ${r.n}`} checked={sel.includes(r.c)} onChange={() => toggleSel(r.c)} /></td>
                      <td className="!text-left mono text-[var(--gold)]">{String(i + 1).padStart(2, "0")}</td>
                      <td className="!text-left"><div className="font-semibold">{r.n}</div><div className="sub mono">{r.c} {r.ind}</div></td>
                      <td className="!text-left w-[160px]">
                        <div className="relative h-7 bg-panel-2/40 rounded overflow-hidden">
                          <div className="absolute inset-y-0 left-0" style={{ width: `${(Math.abs(v) / maxAbs) * 100}%`, background: v >= 0 ? "#f0505a33" : "#22b57333", borderRight: `2px solid ${v >= 0 ? "var(--up)" : "var(--down)"}` }} />
                          <span className={`relative mono leading-7 px-2 ${cls(v)}`}>{pct(v)}</span>
                        </div>
                      </td>
                      <td className="mono">{price(r.price)}</td>
                      <td className="mono">{r.value.toFixed(1)} 億<div className="sub"><Term tip={VR_HELP}>量比</Term> {r.vr.toFixed(1)}x</div></td>
                      <td><Spark data={p === "d" ? sparks[r.c] ?? [] : sparks[r.c] ?? r.c20.slice(-(p as number) - 1)} base={p === "d" ? r.prev : undefined} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data && <div className="sub text-center py-10 loading">載入中…</div>}
            <div className="flex flex-wrap gap-2 justify-center py-3">
              {show < list.length && <button className="btn" onClick={() => setShow(show + 20)}>再看 20 檔</button>}
              <button className="btn" onClick={() => router.push(`/multi?codes=${list.slice(0, 10).map((r) => r.c).join(",")}`)}>前 10 名一起看</button>
            </div>
          </div>
          {sel.length > 0 && (
            <div className="sticky bottom-0 border-t border-line bg-panel px-4 py-2 flex items-center gap-3 rounded-b-[14px]">
              <span>已選 {sel.length} 檔</span><span className="sub">多股比較使用{p === "d" ? "當日" : "近20日"}走勢</span>
              <button className="sub hover:text-text" onClick={() => setSel([])}>清除</button>
              <button className="btn gold ml-auto" onClick={() => router.push(`/multi?codes=${sel.join(",")}`)}>比較已選股票</button>
            </div>
          )}
        </div>
        {cur && (
          <div className="card self-start sticky top-28">
            <div className="card-h">個股速覽 <Link href={`/stock/${cur.c}`} className="sub hover:text-text">完整分析 ›</Link></div>
            <div className="px-4">
              <div className="text-2xl font-bold" style={{ fontFamily: "'Noto Serif TC', serif" }}>{cur.n} <span className="mono text-text-2 text-[14px]">{cur.c}</span></div>
              <div className="sub">{cur.m === "otc" ? "上櫃" : "上市"} · {cur.ind}</div>
              <div className="flex items-baseline gap-3 mt-2"><span className={`mono text-4xl ${cls(cur.chg)}`}>{price(cur.price)}</span><span className={`mono ${cls(cur.pct)}`}>{pct(cur.pct)} 今日</span></div>
            </div>
            <MiniChart code={cur.c} span="day" prev={cur.prev} height={220} />
            <div className="grid grid-cols-2 gap-2 px-4 pb-4 text-[13px] mono">
              <div><span className="sub">成交值</span> {cur.value.toFixed(1)} 億</div>
              <div><span className="sub"><Term tip={VR_HELP}>量比</Term></span> {cur.vr.toFixed(1)}x</div>
              <div><span className="sub">近5日</span> <span className={cls(cur.d5)}>{pct(cur.d5)}</span></div>
              <div><span className="sub">近20日</span> <span className={cls(cur.d20)}>{pct(cur.d20)}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
