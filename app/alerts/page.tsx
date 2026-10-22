"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRules, useFired, firedStore } from "@/components/alerts";
import { useGroups, useScan } from "@/components/hooks";
import StockPicker, { NAME } from "@/components/StockPicker";
import { enablePush, disablePush, pushSupported, usePushOn } from "@/components/push";
import { resolveRules } from "@/components/AlertWatcher";
import { BUILTIN } from "@/components/hooks";
import { describe, KIND_LABEL, type Rule } from "@/lib/alertRules";
import { STRATEGIES, COND } from "@/lib/conditions";
import Help from "@/components/Help";

type Kind = Rule["kind"];
const KINDS: Kind[] = ["price", "pct", "limit", "insti", "strategy", "rvol", "stall"];

export default function Page() {
  return <Suspense><Alerts /></Suspense>;
}

function Alerts() {
  const sp = useSearchParams();
  const { rules, add, toggle, remove } = useRules();
  const fired = useFired();
  const g = useGroups();
  const { data: scan } = useScan(60_000);
  const [kind, setKind] = useState<Kind>("price");
  const [code, setCode] = useState<string | null>(sp.get("code"));
  const [dir, setDir] = useState<"above" | "below" | "up" | "down">("above");
  const [value, setValue] = useState<string>("");
  const [who, setWho] = useState<"f" | "t">("f");
  const [strat, setStrat] = useState(STRATEGIES[0].id);
  const [scope, setScope] = useState("my");
  const push = usePushOn();
  const [pushMsg, setPushMsg] = useState("");
  const live = code ? scan?.rows.find((r) => r.c === code) : undefined;
  const pickKind = (k: Kind) => { setKind(k); setDir(k === "pct" ? "up" : "above"); setValue(k === "pct" ? "3" : k === "insti" ? "1000" : k === "rvol" ? "2" : ""); };

  const needStock = ["price", "pct", "limit", "insti"].includes(kind);
  const groupList = [...g.groups, ...BUILTIN.map((b) => ({ id: b.id, name: b.name, codes: [] as string[] }))];
  const draft: Omit<Rule, "id" | "created" | "on"> | null = (() => {
    if (needStock && !code) return null;
    const base = { kind, code: code ?? undefined, name: code ? NAME.get(code) : undefined };
    // 到價沒填就用現價
    const v = Number(value || (kind === "price" && live ? live.price : 0));
    if (kind === "price") return v > 0 ? { ...base, dir: dir as "above" | "below", value: v } : null;
    if (kind === "pct") return v > 0 ? { ...base, dir: dir as "up" | "down", value: v } : null;
    if (kind === "limit") return base;
    if (kind === "insti") return v > 0 ? { ...base, who, value: v } : null;
    if (kind === "strategy") { const s = STRATEGIES.find((x) => x.id === strat)!; return { kind, conds: s.conds, label: s.label }; }
    if (kind === "rvol") return v > 0 ? { kind, value: v, scope } : null;
    return { kind, scope };
  })();
  const scopeCount = groupList.find((x) => x.id === scope)?.codes.length ?? 0;

  const togglePush = async () => {
    setPushMsg("");
    try {
      if (push) { await disablePush(); setPushMsg("已關閉，伺服器上的規則已刪除。"); }
      else { await enablePush(resolveRules(rules, g.groups, scan?.rows ?? [])); setPushMsg("已開啟。盤中 09:00–13:30 網頁關掉也會收到通知。"); }
    } catch (e) { setPushMsg((e as Error).message); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr_320px]">
      <div className="card self-start p-4 grid grid-cols-1 gap-4 min-w-0">
        <div className="font-semibold text-[16px]">新增提醒</div>
        <div>
          <div className="sub mb-2">提醒類型</div>
          <div className="flex flex-wrap gap-1.5">{KINDS.map((k) => <button key={k} className={`btn ${kind === k ? "on" : ""}`} onClick={() => pickKind(k)}>{KIND_LABEL[k]}</button>)}</div>
        </div>
        {needStock && (
          <div>
            <div className="sub mb-2">股票</div>
            <StockPicker onPick={setCode} placeholder={code ? `${code} ${NAME.get(code) ?? ""}（可重新搜尋）` : "輸入代號或名稱"} />
          </div>
        )}
        {(kind === "price" || kind === "pct") && (
          <div>
            <div className="sub mb-2">{kind === "price" ? "成交價條件" : "漲跌幅條件"}</div>
            <div className="flex gap-2">
              <div className="seg">{(kind === "price" ? [["above", "高於"], ["below", "低於"]] : [["up", "漲幅"], ["down", "跌幅"]]).map(([k, l]) => <button key={k} className={dir === k ? "on" : ""} onClick={() => setDir(k as typeof dir)}>{l}</button>)}</div>
              <input type="number" step="any" value={value} placeholder={kind === "price" && live ? String(live.price) : ""} onChange={(e) => setValue(e.target.value)} className="flex-1 min-w-0 bg-panel-2 border border-line rounded-lg px-3 mono text-right" />
              <span className="sub self-center">{kind === "price" ? "元" : "%"}</span>
            </div>
          </div>
        )}
        {kind === "insti" && (
          <div>
            <div className="sub mb-2">單日買超門檻</div>
            <div className="flex gap-2">
              <div className="seg"><button className={who === "f" ? "on" : ""} onClick={() => setWho("f")}>外資</button><button className={who === "t" ? "on" : ""} onClick={() => setWho("t")}>投信</button></div>
              <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="flex-1 min-w-0 bg-panel-2 border border-line rounded-lg px-3 mono text-right" /><span className="sub self-center">張</span>
            </div>
          </div>
        )}
        {kind === "strategy" && (
          <div>
            <div className="sub mb-2 flex">策略 <Link href="/screener" className="ml-auto text-[var(--gold)]">到選股器自訂條件</Link></div>
            <div className="flex flex-wrap gap-1.5">{STRATEGIES.map((s) => <button key={s.id} className={`btn ${strat === s.id ? "on" : ""}`} onClick={() => setStrat(s.id)}>{s.label}</button>)}</div>
            <div className="sub mt-2">{STRATEGIES.find((s) => s.id === strat)!.conds.map((c) => COND[c].label).join(" ＋ ")}</div>
          </div>
        )}
        {(kind === "rvol" || kind === "stall") && (
          <div>
            <div className="sub mb-2 flex">範圍 <Link href="/watchlist" className="ml-auto text-[var(--gold)]">管理自選股</Link></div>
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full bg-panel-2 border border-line rounded-lg px-3 py-2 text-[13px]">
              {groupList.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id.startsWith("b-") ? "（自動）" : `（${x.codes.length} 檔）`}</option>)}
            </select>
            {kind === "rvol" && <div className="flex gap-2 mt-3 items-center"><span className="sub">同時段 RVOL 門檻</span><input type="number" step="0.5" value={value} onChange={(e) => setValue(e.target.value)} className="w-20 bg-panel-2 border border-line rounded-lg px-3 py-1 mono text-right" /><span className="sub">倍</span></div>}
          </div>
        )}
        <div className="flex items-center gap-2 text-[13px]"><span className="sub">通知方式</span><b>{push ? "網頁通知 ＋ 背景推播" : "網頁通知"}</b></div>
        <div className="rounded-lg bg-panel-2 px-3 py-2 text-[13px] leading-relaxed">
          {draft ? <>{describe({ ...draft, id: "", created: 0, on: true } as Rule)}時，用{push ? "通知" : "網頁通知"}提醒我。{(kind === "rvol" || kind === "stall") && <div className="sub mt-1">盤中檢查，每檔每個交易日最多通知一次，跌回再上來不重複；只描述量價現象，不代表誰在買賣。{!scope.startsWith("b-") && !scopeCount && "（這個群組目前是空的）"}</div>}</>
            : <span className="sub">{needStock && !code ? "先選一檔股票，這裡會顯示提醒內容。" : "填好條件，這裡會顯示提醒內容。"}</span>}
        </div>
        <button className="btn gold justify-center py-2.5" disabled={!draft} onClick={() => draft && add(draft)}>建立提醒</button>
      </div>

      <div className="card self-start">
        <div className="card-h">我的提醒 <span className="sub">啟用中 {rules.filter((r) => r.on).length} / {rules.length}</span></div>
        <div className="px-2 pb-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-panel-2">
              <span className="chip">{KIND_LABEL[r.kind]}</span>
              <span className={`flex-1 text-[13px] ${r.on ? "" : "text-dim line-through"}`}>{describe(r)}</span>
              {r.code && <Link href={`/stock/${r.code}`} className="sub hover:text-text">看</Link>}
              <button role="switch" aria-checked={r.on} aria-label={r.on ? "停用" : "啟用"} onClick={() => toggle(r.id)} className={`w-9 h-5 rounded-full relative ${r.on ? "bg-[var(--gold)]" : "bg-[#3a3f47]"}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#111] transition-all ${r.on ? "left-[18px]" : "left-0.5"}`} /></button>
              <button className="text-text-2 hover:text-[var(--up)]" aria-label="刪除提醒" onClick={() => remove(r.id)}>✕</button>
            </div>
          ))}
          {!rules.length && <div className="sub text-center py-16">🔔<br />還沒有提醒，用「新增提醒」面板建立第一個。</div>}
        </div>
      </div>

      <div className="grid gap-4 content-start">
        <div className="card p-4">
          <div className="flex items-center font-semibold">背景推播<Help>開啟時，提醒規則會傳到伺服器（不含任何個人資料、沒有帳號）；關閉後伺服器會刪除。iPhone 要先把網站「加入主畫面」，從主畫面打開才能收推播。</Help> <span className={`ml-auto sub ${push ? "text-[var(--gold-2)]" : ""}`}>{push ? "已開啟" : "未開啟"}</span></div>
          <p className="text-[13px] mt-2 leading-relaxed">{push ? "網頁關掉也會收到通知：盤中 09:00–13:30 由資金流記錄器每 30 秒檢查一次規則。" : "現在只有這個網頁開著時才會檢查提醒。開啟後，網頁關掉也會收到通知（盤中由資金流記錄器檢查）。"}</p>
          <button className={`btn w-full justify-center mt-3 py-2 ${push ? "" : "gold"}`} disabled={!pushSupported() && !push} onClick={togglePush}>{push ? "關閉背景推播" : "開啟背景推播"}</button>
          {pushMsg && <div className="sub mt-2">{pushMsg}</div>}
          {!pushSupported() && <div className="sub mt-2">這個瀏覽器不支援背景推播。</div>}
        </div>
        <div className="card">
          <div className="card-h">觸發紀錄 {fired.length > 0 && <button className="sub hover:text-text" onClick={() => firedStore.write([])}>清除</button>}</div>
          <div className="scroll-y max-h-[480px] px-2 pb-2">
            {fired.map((f, i) => (
              <Link key={i} href={f.link} className="block px-2 py-2 rounded-lg hover:bg-panel-2 text-[13px]">
                <span className="mono sub mr-2">{new Date(f.t + 8 * 3600e3).toISOString().slice(5, 16).replace("T", " ").replace("-", "/")}</span>{f.msg}
              </Link>
            ))}
            {!fired.length && <div className="sub px-2 pb-3 leading-relaxed">還沒有提醒被觸發過。條件符合的那一刻，時間和內容會記在這裡，點一下可以看那檔股票（選股策略會帶你到選股器）。</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
