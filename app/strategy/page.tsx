"use client";
// AI 策略回測：左邊跟 AI 對話描述選股想法，右邊是規則流程圖＋回測摘要，點開看完整回測（資產曲線、交易紀錄）
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { localStore, useWatchlist } from "@/components/hooks";
import { cls, num, price } from "@/components/fmt";
import Help from "@/components/Help";
import { condChip, condText, exitChip, exitText, rankText, specReply, universeText, type Spec } from "@/lib/strategySpec";
import type { Result, Trade } from "@/lib/strategy";

type Msg = { r: "u" | "a"; t: string };
type Saved = { id: string; spec: Spec; at: number; chat?: Msg[] };
const MAX = 10;
const store = localStore<Saved[]>("namba.strategies", () => []);
const NONE: Saved[] = [];

const EXAMPLES = [
  "量能放大到 2 倍、收盤創 60 日新高就進場，跌破月線出場",
  "投信連 3 天買超而且股價在季線之上，停損 7%，最多抱 10 天",
  "一週內急跌 10% 以上、RSI 低於 30 的股票，反彈 8% 就賣",
  "散熱族群站上月線就買，跌破就賣",
  "大型權值股均線多頭排列時買進，從高點回落 10% 出場",
  "自選股當天漲超過 3% 又爆量就追，虧 6% 停損",
];

/** 存到 localStorage：有 id 就更新，沒有就新增一筆，回傳 id */
function save(s: Spec, c: Msg[], id: string | null) {
  const list = store.read();
  if (id && list.some((x) => x.id === id)) { store.write(list.map((x) => (x.id === id ? { ...x, spec: s, chat: c, at: Date.now() } : x))); return id; }
  const nid = Math.random().toString(36).slice(2, 10);
  store.write([{ id: nid, spec: s, chat: c, at: Date.now() }, ...list].slice(0, MAX));
  return nid;
}

const HELP = "回測規則：每天收盤後檢查進場條件，符合的隔天開盤買進，每檔資金平均分配；停損、停利盤中碰到就賣（跳空就用開盤價），跌破均線隔天開盤賣，持有天數到了當天收盤賣。已扣手續費 0.1425%×2 與證交稅 0.3%，沒算股利。0050 對照是同一段期間買進持有。過去績效不代表未來，AI 只產生規則、不會幫你下單，也不是投資建議。";

export default function Page() {
  const saved = useSyncExternalStore(store.subscribe, store.read, () => NONE);
  const wl = useWatchlist();
  const [cur, setCur] = useState<string | null>(null);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [chat, setChat] = useState<Msg[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"ai" | "bt" | null>(null);
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const chatBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => { if (chat.length || err) chatBox.current?.scrollTo({ top: chatBox.current.scrollHeight, behavior: "smooth" }); }, [chat, busy, err]);

  const call = async (body: object, mode: "ai" | "bt") => {
    setSec(0); setBusy(mode); setErr(null);
    try {
      const r = await fetch("/api/strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, watchlist: wl.list }) });
      const j = await r.json();
      if (j.error) { setErr(j.error); return null; }
      return j as { spec: Spec; result: Result; reply?: string };
    } catch (e) {
      setErr(`連線失敗：${(e as Error).message}`);
      return null;
    } finally { setBusy(null); }
  };


  const ask = async (q = text) => {
    const t = q.trim();
    if (!t || busy) return;
    const before = chat;
    setChat([...before, { r: "u", t }]); setText("");
    const j = await call(spec ? { text: t, prev: spec } : { text: t }, "ai");
    if (!j) { setChat(before); setText(t); return; }
    const c: Msg[] = [...before, { r: "u", t }, { r: "a", t: j.reply ?? specReply(j.spec, wl.list.length) }];
    setSpec(j.spec); setResult(j.result); setChat(c);
    setCur(save(j.spec, c, cur));
  };
  /** 直接改規格（刪條件、改持股數）：不問 AI，只重跑回測 */
  const edit = async (s: Spec, what: string) => {
    const c: Msg[] = [...chat, { r: "u", t: what }, { r: "a", t: "好，已照這個修改重新回測。" }];
    setSpec(s); setChat(c); setResult(null);
    setCur(save(s, c, cur));
    const j = await call({ spec: s }, "bt");
    if (j) setResult(j.result);
  };
  const open = async (s: Saved) => {
    if (busy) return;
    setCur(s.id); setSpec(s.spec); setResult(null); setErr(null); setReport(false);
    setChat(s.chat ?? [{ r: "u", t: s.spec.idea }, { r: "a", t: specReply(s.spec, wl.list.length) }]);
    const j = await call({ spec: s.spec }, "bt");
    if (j) setResult(j.result);
  };
  const fresh = () => { if (busy) return; setCur(null); setSpec(null); setChat([]); setResult(null); setErr(null); setText(""); setReport(false); };
  const del = (id: string) => { store.write(store.read().filter((x) => x.id !== id)); if (id === cur) fresh(); };
  const copy = () => {
    if (!spec || saved.length >= MAX) return;
    const s = { ...spec, name: `${spec.name}（複本）` };
    setSpec(s); setCur(save(s, chat, null));
  };

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-lg font-bold flex items-center gap-1">AI 策略回測<Help>{HELP}</Help></h1>
        <div className="sub">說出選股想法 → 整理成規則流程 → 用近半年資料回測</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={`btn ${!cur ? "on" : ""}`} onClick={fresh}>＋ 新策略</button>
        {saved.map((s) => (
          <span key={s.id} className={`btn group !pr-2 ${s.id === cur ? "on" : ""}`} role="button" tabIndex={0} title={s.spec.idea}
            onClick={() => open(s)} onKeyDown={(e) => { if (e.key === "Enter") open(s); }}>
            {s.spec.name}
            <button aria-label={`刪除策略 ${s.spec.name}`} title="刪除" className="text-text-2 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-text text-[11px]"
              onClick={(e) => { e.stopPropagation(); del(s.id); }}>✕</button>
          </span>
        ))}
        <span className="mono sub">{saved.length}/{MAX}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,2fr)_3fr] items-start">
        <div className="card flex flex-col lg:sticky lg:top-28 h-[calc(100vh-15rem)] min-h-[420px]">
          <div ref={chatBox} className="scroll-y flex-1 px-4 pt-4 pb-2 grid gap-3 content-start">
            {!chat.length && (
              <>
                <div className="text-[14px] text-text-2 leading-relaxed">用平常講話的方式描述就好：什麼時候買、什麼時候賣、從哪些股票裡挑。AI 會整理成右邊的規則流程，再拿最近半年的每日收盤資料試算，跟單純買 0050 比比看。</div>
                {EXAMPLES.map((x) => (
                  <button key={x} className="text-left rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-[13.5px] hover:border-dim disabled:opacity-50" disabled={!!busy} onClick={() => ask(x)}>{x}</button>
                ))}
              </>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap ${m.r === "u" ? "justify-self-end bg-[#2a2416] text-[var(--gold-2)]" : "justify-self-start bg-panel-2"}`}>{m.t}</div>
            ))}
            {busy === "ai" && <div className="justify-self-start rounded-2xl px-3.5 py-2.5 text-[13px] bg-panel-2 text-text-2 loading">AI 正在整理規則並試算…已等 {sec} 秒（學校 AI 通常 10～80 秒）</div>}
            {err && <div className="justify-self-start rounded-2xl px-3.5 py-2.5 text-[13px] bg-panel-2 text-[var(--up)]">{err}</div>}
          </div>
          <div className="border-t border-line p-3">
            <div className="flex gap-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={300}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }}
                placeholder={spec ? "要改哪裡？例如「停損改 5%」「只看上櫃」" : "說出你的選股想法…"}
                className="flex-1 rounded-xl bg-panel-2 border border-line px-3 py-2 text-[14px] resize-none focus:outline-none focus:border-dim" />
              <button className="btn gold self-stretch !px-4 !text-[16px]" aria-label="送出" disabled={!text.trim() || !!busy} onClick={() => ask()}>↑</button>
            </div>
            <div className="text-[11px] text-dim mt-1.5">AI 只產生規則，不會幫你下單；僅供參考，不是投資建議。</div>
          </div>
        </div>

        {spec ? <Flow spec={spec} wlCount={wl.list.length} result={result} busy={busy} onEdit={edit} onCopy={saved.length < MAX ? copy : undefined} onDelete={cur ? () => del(cur) : undefined} onReport={() => setReport(true)} />
          : <Skeleton />}
      </div>
      {report && result && spec && <Report name={spec.name} r={result} onClose={() => setReport(false)} />}
    </div>
  );
}

// ---------- 流程圖 ----------
const I = {
  clock: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  filter: "M4 6h16M7 12h10M10 18h4",
  enter: "M4 12h12M12 8l4 4-4 4M20 5v14",
  bars: "M6 18V11M10 18V7M14 18v-5M18 18V9",
  exit: "M4 5v14M8 12h12M16 8l4 4-4 4",
};
const Icon = ({ d }: { d: string }) => (
  <span className="grid place-items-center w-9 h-9 shrink-0 rounded-xl border border-line bg-panel text-text-2">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  </span>
);
const Line = () => <div className="ml-[34px] h-3 border-l border-line" />;

function Node({ icon, label, children, badge, detail }: { icon: string; label: string; children: React.ReactNode; badge?: React.ReactNode; detail?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-2xl border bg-panel-2 ${open ? "border-dim" : "border-line"}`}>
      <div className={`flex items-center gap-3 px-4 py-3 ${detail ? "cursor-pointer" : ""}`} onClick={() => detail && setOpen(!open)}
        role={detail ? "button" : undefined} tabIndex={detail ? 0 : undefined} aria-expanded={detail ? open : undefined}
        onKeyDown={(e) => { if (detail && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(!open); } }}>
        <Icon d={icon} />
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] text-dim">{label}</div>
          <div className="text-[14px] leading-relaxed">{children}</div>
        </div>
        {badge}
        {detail && <span className={`text-dim text-[18px] transition-transform ${open ? "rotate-90" : ""}`}>›</span>}
      </div>
      {open && detail && <div className="px-4 pb-3 sm:pl-16 grid gap-2">{detail}</div>}
    </div>
  );
}
const Chips = ({ list }: { list: string[] }) => <span className="inline-flex flex-wrap gap-1.5 align-middle">{list.map((x, i) => <span key={i} className="chip !text-[12.5px] !py-0.5">{x}</span>)}</span>;

function Row({ text, onRemove }: { text: string; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-panel px-3 py-2 text-[13.5px]">
      <span className="flex-1">{text}</span>
      {onRemove && <button aria-label={`移除：${text}`} title="移除" className="text-text-2 hover:text-text px-1" onClick={onRemove}>✕</button>}
    </div>
  );
}

function Flow({ spec, wlCount, result, busy, onEdit, onCopy, onDelete, onReport }: {
  spec: Spec; wlCount: number; result: Result | null; busy: "ai" | "bt" | null;
  onEdit: (s: Spec, what: string) => void; onCopy?: () => void; onDelete?: () => void; onReport: () => void;
}) {
  return (
    <div className="card p-5 grid">
      <div className="flex items-start gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <div className="text-[18px] font-semibold">{spec.name}</div>
          <div className="sub mt-0.5">{spec.idea}</div>
        </div>
        {onCopy && <button className="btn !px-2.5" title="複製一份" aria-label="複製一份" onClick={onCopy}>⧉</button>}
        {onDelete && <button className="btn !px-2.5" title="刪除策略" aria-label="刪除策略" onClick={onDelete}>✕</button>}
      </div>
      <Node icon={I.clock} label="觸發">每個交易日收盤後檢查，下一個交易日開盤買賣</Node>
      <Line />
      <Node icon={I.filter} label="市場範圍" detail={<div className="sub">要換範圍請在左邊直接說，例如「改成只看上櫃」「只看半導體」。</div>}>
        {universeText(spec.universe, wlCount)}，只做多
      </Node>
      <Line />
      <Node icon={I.enter} label="進場條件（全部成立）"
        badge={result && <span className="mono text-[12px] text-text-2 border border-line rounded-full px-2.5 py-0.5 whitespace-nowrap">{md(result.to)} 符合 {result.today.length} 檔</span>}
        detail={<>
          {spec.entry.map((c, i) => <Row key={i} text={condText(c)} onRemove={spec.entry.length > 1 && !busy ? () => onEdit({ ...spec, entry: spec.entry.filter((_, j) => j !== i) }, `拿掉進場條件「${condText(c)}」`) : undefined} />)}
          <div className="sub">要加條件請在左邊直接說，例如「再加上成交值 5 億以上」。</div>
        </>}>
        <Chips list={spec.entry.map(condChip)} />
      </Node>
      <Line />
      <Node icon={I.bars} label="持股"
        detail={<>
          <label className="flex items-center gap-2 text-[13.5px]">最多同時
            <select className="rounded-lg bg-panel border border-line px-2 py-1 mono" value={spec.hold.max} disabled={!!busy}
              onChange={(e) => onEdit({ ...spec, hold: { max: Number(e.target.value) } }, `持股上限改成 ${e.target.value} 檔`)}>
              {[...new Set([1, 3, 5, 10, 15, 20, spec.hold.max])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>檔
          </label>
          <div className="sub">訊號超過名額時，優先買{rankText(spec.rank)}的。</div>
        </>}>
        最多同時 {spec.hold.max} 檔，每檔等權重
      </Node>
      <Line />
      <Node icon={I.exit} label="出場（任一成立）"
        detail={spec.exit.map((e, i) => <Row key={i} text={exitText(e)} onRemove={spec.exit.length > 1 && !busy ? () => onEdit({ ...spec, exit: spec.exit.filter((_, j) => j !== i) }, `拿掉出場條件「${exitText(e)}」`) : undefined} />)}>
        {spec.exit.map(exitChip).join(" · ")}
      </Node>

      <div className="text-[12.5px] text-text-2 mt-4 grid gap-1">
        <div>✓ {spec.entry.length} 個進場條件 → {spec.exit.length} 個出場條件，最多 {spec.hold.max} 檔</div>
        {!!spec.assume?.length && <div>AI 自己補的假設：{spec.assume.join("；")}</div>}
        {!!spec.unsupported?.length && <div className="text-[var(--gold)]">這些沒有資料、已略過：{spec.unsupported.join("；")}</div>}
      </div>

      {result ? (
        <>
          <button className="mt-4 rounded-2xl border border-line bg-panel-2 hover:border-dim px-4 py-3 text-left flex items-center gap-3" onClick={onReport}>
            <div className="flex-1">
              <div className="sub mb-1">回測 {md(result.from)}～{md(result.to)} · {result.days} 個交易日</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Mini l="累計報酬" v={sp(result.ret)} c={result.ret} />
                <Mini l="同期 0050" v={sp(result.bench)} c={result.bench ?? 0} />
                <Mini l="最大回檔" v={sp(result.maxDD)} c={result.maxDD} />
                <Mini l="勝率" v={result.winRate == null ? "—" : `${result.winRate.toFixed(0)}%`} />
              </div>
            </div>
            <span className="text-dim text-[18px]">›</span>
          </button>
          <button className="btn gold justify-center mt-3 !py-3 !text-[15px]" onClick={onReport}>看回測結果</button>
        </>
      ) : (
        <div className="mt-4 sub loading">{busy ? "回測中…" : "等待回測"}</div>
      )}
    </div>
  );
}
function Mini({ l, v, c }: { l: string; v: string; c?: number }) {
  return <div><div className="text-[11.5px] text-text-2">{l}</div><div className={`mono text-[17px] ${c == null ? "" : cls(c)}`}>{v}</div></div>;
}

function Skeleton() {
  const rows: [string, string, string][] = [[I.clock, "觸發", "55%"], [I.filter, "市場範圍", "70%"], [I.enter, "進場條件", "85%"], [I.bars, "持股", "60%"], [I.exit, "出場", "50%"]];
  return (
    <div className="card p-5">
      <div className="text-[15px] text-text-2 mb-4">規則流程會顯示在這裡</div>
      {rows.map(([d, l, w], i) => (
        <div key={l}>
          {i > 0 && <Line />}
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3">
            <Icon d={d} />
            <div className="flex-1"><div className="text-[11.5px] text-dim">{l}</div><div className="h-2.5 rounded-full bg-panel-2 mt-2" style={{ width: w }} /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- 回測結果（彈出視窗） ----------
const sp = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function Report({ name, r, onClose }: { name: string; r: Result; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    const o = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = o; };
  }, [onClose]);
  const ex = r.bench == null ? null : r.ret - r.bench;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="回測結果" className="card w-full max-w-[760px] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center px-5 pt-4 pb-2">
          <span className="text-[17px] font-semibold flex-1">回測結果</span>
          <button className="btn !px-2.5" aria-label="關閉" onClick={onClose}>✕</button>
        </div>
        <div className="scroll-y px-5 pb-5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[16px] font-semibold">{name}</span>
            <span className="sub mono">{md(r.from)}–{md(r.to)} · {r.days} 個交易日 · 範圍 {num(r.universeSize)} 檔</span>
          </div>
          <Curve data={r.curve} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mt-4">
            <Mini l="累計報酬" v={sp(r.ret)} c={r.ret} />
            <Mini l="同期 0050" v={sp(r.bench)} c={r.bench ?? 0} />
            <Mini l="最大回檔" v={sp(r.maxDD)} c={r.maxDD} />
            <Mini l="勝率" v={r.winRate == null ? "—" : `${r.winRate.toFixed(0)}%`} />
            <Mini l="交易筆數" v={String(r.trades)} />
            <Mini l="平均每筆 · 持有" v={r.avgRet == null ? "—" : `${sp(r.avgRet)} · ${r.avgDays?.toFixed(1)} 天`} c={r.avgRet ?? undefined} />
          </div>
          {ex != null && <div className="sub mt-2">比 0050 {ex >= 0 ? "多賺" : "少賺"} {Math.abs(ex).toFixed(2)} 個百分點</div>}

          <Section title={`${md(r.to)} 收盤符合進場`} sub={`${r.today.length} 檔 · 下個交易日開盤買`}>
            {r.today.map((x) => <TRow key={x.code} code={x.code} name={x.name} mid={`收 ${price(x.close)} · 成交 ${x.value.toFixed(1)} 億`} v={x.chg} />)}
            {!r.today.length && <div className="sub py-3">今天沒有股票符合</div>}
          </Section>
          {!!r.holding.length && (
            <Section title={`${md(r.to)} 收盤還持有`} sub={`${r.holding.length} 檔`}>
              {r.holding.map((t, i) => <TradeRow key={`${t.code}-${i}`} t={t} />)}
            </Section>
          )}
          <Section title="交易紀錄" sub={`共 ${r.list.length} 筆，新到舊`}>
            {r.list.map((t, i) => <TradeRow key={`${t.code}-${t.inDate}-${i}`} t={t} />)}
            {!r.list.length && <div className="sub py-3">這段期間沒有完成的交易</div>}
          </Section>
          {r.note.map((n) => <div key={n} className="sub mt-2">※ {n}</div>)}
          <div className="text-[12px] text-dim mt-4 leading-relaxed">{HELP}</div>
        </div>
      </div>
    </div>
  );
}
function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="flex items-baseline gap-2 mb-1"><span className="text-[14px] font-semibold">{title}</span><span className="sub">{sub}</span></div>
      <div className="divide-y divide-[var(--line)]">{children}</div>
    </div>
  );
}
function TRow({ code, name, mid, v }: { code: string; name: string; mid: string; v: number }) {
  return (
    <div className="flex items-center gap-3 py-2 text-[13.5px]">
      <Link href={`/stock/${code}`} className="hover:text-[var(--gold)] shrink-0"><span className="mono text-text-2 mr-1.5">{code}</span>{name}</Link>
      <span className="flex-1 text-right mono text-text-2 truncate">{mid}</span>
      <span className={`mono w-[5em] text-right ${cls(v)}`}>{sp(v)}</span>
    </div>
  );
}
const TradeRow = ({ t }: { t: Trade }) => (
  <TRow code={t.code} name={t.name} v={t.ret} mid={t.outDate ? `${md(t.inDate)}→${md(t.outDate)} · ${t.why}` : `${md(t.inDate)} 起 · ${t.days} 天`} />
);

/** 資產曲線：策略（金色）vs 0050（灰），起點都是 100 */
function Curve({ data }: { data: [string, number, number | null][] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return null;
  const W = 800, H = 200, P = 6;
  const vals = data.flatMap(([, a, b]) => (b == null ? [a] : [a, b]));
  const lo = Math.min(...vals, 100), hi = Math.max(...vals, 100);
  const x = (i: number) => P + (i / (data.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const line = (k: 1 | 2) => data.map((d, i) => (d[k] == null ? "" : `${x(i)},${y(d[k] as number)}`)).filter(Boolean).join(" ");
  const h = hover == null ? data.at(-1)! : data[hover];
  return (
    <div className="mt-4">
      <div className="flex gap-4 text-[12px] mono mb-1">
        <span className="text-text-2">{h[0].replace(/-/g, "/")}</span>
        <span style={{ color: "var(--gold)" }}>策略 {(h[1] - 100).toFixed(2)}%</span>
        {h[2] != null && <span className="text-text-2">0050 {(h[2] - 100).toFixed(2)}%</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px]" preserveAspectRatio="none"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.round(((e.clientX - r.left) / r.width) * (data.length - 1))); }}
        onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={y(100)} y2={y(100)} stroke="#2a2f37" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <polyline points={line(2)} fill="none" stroke="#6b7280" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <polyline points={line(1)} fill="none" stroke="var(--gold)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="#444" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="flex justify-between text-[11px] text-dim mono"><span>{md(data[0][0])}</span><span>{md(data.at(-1)![0])}</span></div>
    </div>
  );
}
