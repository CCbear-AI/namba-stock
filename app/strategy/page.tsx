"use client";
// AI 策略回測：一句話描述選股想法 → AI 轉成規則（流程圖）→ 用盤後日 K 回測、跟 0050 比
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { localStore, useWatchlist } from "@/components/hooks";
import { cls, num, price } from "@/components/fmt";
import Help from "@/components/Help";
import { condText, exitText, universeText, type Spec } from "@/lib/strategySpec";
import type { Result, Trade } from "@/lib/strategy";

type Saved = { id: string; spec: Spec; at: number };
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

const HELP = "回測規則：每天收盤後檢查進場條件，符合的隔天開盤買進，每檔資金平均分配；停損、停利盤中碰到就賣（跳空就用開盤價），跌破均線隔天開盤賣，持有天數到了當天收盤賣。已扣手續費 0.1425%×2 與證交稅 0.3%，沒算股利。0050 對照是同一段期間買進持有。過去績效不代表未來，AI 只產生規則、不會幫你下單，也不是投資建議。";

export default function Page() {
  const saved = useSyncExternalStore(store.subscribe, store.read, () => NONE);
  const wl = useWatchlist();
  const [cur, setCur] = useState<string | null>(null);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"ai" | "bt" | null>(null);
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const call = async (body: object, mode: "ai" | "bt") => {
    setSec(0); setBusy(mode); setErr(null);
    try {
      const r = await fetch("/api/strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, watchlist: wl.list }) });
      const j = await r.json();
      if (j.error) { setErr(j.error); return null; }
      return j as { spec: Spec; result: Result };
    } catch (e) {
      setErr(`連線失敗：${(e as Error).message}`);
      return null;
    } finally { setBusy(null); }
  };

  const save = (s: Spec, id: string | null) => {
    const list = store.read();
    if (id && list.some((x) => x.id === id)) { store.write(list.map((x) => (x.id === id ? { ...x, spec: s, at: Date.now() } : x))); return id; }
    const nid = Math.random().toString(36).slice(2, 10);
    store.write([{ id: nid, spec: s, at: Date.now() }, ...list].slice(0, MAX));
    return nid;
  };

  const ask = async () => {
    const t = text.trim();
    if (!t || busy) return;
    const j = await call(spec ? { text: t, prev: spec } : { text: t }, "ai");
    if (!j) return;
    setSpec(j.spec); setResult(j.result); setText("");
    setCur(save(j.spec, cur));
  };
  const open = async (s: Saved) => {
    setCur(s.id); setSpec(s.spec); setResult(null); setErr(null);
    const j = await call({ spec: s.spec }, "bt");
    if (j) setResult(j.result);
  };
  const fresh = () => { setCur(null); setSpec(null); setResult(null); setErr(null); setText(""); };
  const del = (id: string) => { store.write(store.read().filter((x) => x.id !== id)); if (id === cur) fresh(); };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="card self-start lg:sticky lg:top-28 flex flex-col max-h-[calc(100vh-8rem)]">
        <div className="card-h text-[16px]"><span>AI 策略回測<Help>{HELP}</Help></span></div>
        <div className="px-4 sub -mt-1 mb-2">一句話描述，馬上看半年試算</div>
        <div className="px-4 pb-3">
          <button className="btn gold w-full justify-center" onClick={fresh}>＋ 新策略</button>
        </div>
        <div className="px-4 flex items-center sub">我的策略<span className="ml-auto mono">{saved.length}/{MAX}</span></div>
        <div className="scroll-y flex-1 px-2 py-1">
          {saved.map((s) => (
            <div key={s.id} className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer ${s.id === cur ? "bg-panel-2" : "hover:bg-panel-2"}`} onClick={() => open(s)}>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] truncate">{s.spec.name}</span>
                <span className="block text-[11px] text-dim truncate">{s.spec.idea}</span>
              </span>
              <button aria-label="刪除策略" title="刪除" className="text-text-2 opacity-0 group-hover:opacity-100 hover:text-text px-1" onClick={(e) => { e.stopPropagation(); del(s.id); }}>✕</button>
            </div>
          ))}
          {!saved.length && <div className="sub px-2 py-4">還沒有策略，描述一下你的選股想法就能開始</div>}
        </div>
      </div>

      <div className="grid gap-4 content-start">
        <div className="card p-4">
          <div className="text-[15px] font-semibold mb-1">{spec ? "想改哪裡？直接說" : "你想怎麼選股？"}</div>
          <div className="sub mb-3">{spec ? "例如「停損改 5%」「改成只看上櫃」「加上成交值 5 億以上」，沒提到的部分會保持不變。" : "用平常講話的方式描述就好：什麼時候買、什麼時候賣、從哪些股票裡挑。AI 會整理成規則，再拿最近半年的每日收盤資料試算，看看跟單純買 0050 比起來如何。"}</div>
          <div className="flex gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={300}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }}
              placeholder={spec ? "說一句修改…" : "例如：爆量創 60 日新高就買，跌破月線就賣"}
              className="flex-1 rounded-lg bg-panel-2 border border-line px-3 py-2 text-[14px] resize-none focus:outline-none focus:border-dim" />
            <button className="btn gold self-stretch px-5" disabled={!text.trim() || !!busy} onClick={ask}>{spec ? "修改" : "產生"}</button>
          </div>
          {!spec && (
            <div className="flex flex-wrap gap-2 mt-3">
              {EXAMPLES.map((x) => <button key={x} className="chip text-left hover:text-text" onClick={() => setText(x)}>{x}</button>)}
            </div>
          )}
          {busy && <div className="sub mt-3 loading">{busy === "ai" ? `AI 正在整理規則並試算…已等 ${sec} 秒（學校 AI 通常 20～80 秒）` : "回測中…"}</div>}
          {err && <div className="mt-3 text-[13px] text-[var(--up)]">{err}</div>}
        </div>

        {spec && <Flow spec={spec} wlCount={wl.list.length} />}
        {result && <Report r={result} />}
      </div>
    </div>
  );
}

function Box({ step, title, children, accent }: { step: string; title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl bg-panel-2 px-4 py-3 border-l-4" style={{ borderColor: accent ?? "var(--line)" }}>
      <div className="text-[11px] text-dim">{step}</div>
      <div className="text-[13px] font-semibold mb-1">{title}</div>
      <div className="text-[13px] text-text-2 leading-relaxed">{children}</div>
    </div>
  );
}
const Arrow = () => <div className="text-center text-dim leading-none">↓</div>;

function Flow({ spec, wlCount }: { spec: Spec; wlCount: number }) {
  return (
    <div className="card">
      <div className="card-h"><span>{spec.name}</span><span className="sub font-normal">{spec.idea}</span></div>
      <div className="px-4 pb-4 grid gap-1.5">
        <Box step="① 觸發" title="每個交易日收盤後檢查">符合條件的股票，隔天開盤買進</Box>
        <Arrow />
        <Box step="② 市場範圍" title="從哪裡挑">{universeText(spec.universe, wlCount)}</Box>
        <Arrow />
        <Box step="③ 進場條件" title="以下全部成立" accent="var(--up)">
          <ul className="list-disc pl-5">{spec.entry.map((c, i) => <li key={i}>{condText(c)}</li>)}</ul>
        </Box>
        <Arrow />
        <Box step="④ 持股" title={`最多同時 ${spec.hold.max} 檔，資金平均分配`}>
          訊號超過名額時，優先買{spec.rank === "chg" ? "當天漲最多" : spec.rank === "volRatio" ? "量放最大" : "成交值最大"}的
        </Box>
        <Arrow />
        <Box step="⑤ 出場" title="任一成立就賣" accent="var(--down)">
          <ul className="list-disc pl-5">{spec.exit.map((e, i) => <li key={i}>{exitText(e)}</li>)}</ul>
        </Box>
        {(!!spec.assume?.length || !!spec.unsupported?.length) && (
          <div className="mt-2 text-[12px] text-text-2 grid gap-1">
            {!!spec.assume?.length && <div>AI 自己補的假設：{spec.assume.join("；")}</div>}
            {!!spec.unsupported?.length && <div className="text-[var(--gold)]">這些做不到、已略過：{spec.unsupported.join("；")}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ l, v, c, sub }: { l: string; v: string; c?: number; sub?: string }) {
  return (
    <div className="rounded-xl bg-panel-2 px-3 py-2">
      <div className="text-[12px] text-text-2">{l}</div>
      <div className={`mono text-xl ${c == null ? "" : cls(c)}`}>{v}</div>
      {sub && <div className="text-[11px] text-dim">{sub}</div>}
    </div>
  );
}
const sp = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function Report({ r }: { r: Result }) {
  const ex = r.bench == null ? null : r.ret - r.bench;
  return (
    <>
      <div className="card">
        <div className="card-h"><span>回測結果</span><span className="sub font-normal">{r.from.replace(/-/g, "/")} ~ {r.to.replace(/-/g, "/")} · {r.days} 個交易日 · 範圍 {num(r.universeSize)} 檔</span></div>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat l="策略報酬" v={sp(r.ret)} c={r.ret} sub={ex == null ? undefined : `${ex >= 0 ? "贏" : "輸"} 0050 ${Math.abs(ex).toFixed(2)} 個百分點`} />
            <Stat l="0050 同期" v={sp(r.bench)} c={r.bench ?? 0} />
            <Stat l="最大回檔" v={sp(r.maxDD)} c={r.maxDD} />
            <Stat l="交易次數 · 勝率" v={`${r.trades} · ${r.winRate == null ? "—" : `${r.winRate.toFixed(0)}%`}`} sub={r.avgRet == null ? undefined : `平均每筆 ${sp(r.avgRet)}，抱 ${r.avgDays?.toFixed(1)} 天`} />
          </div>
          <Curve data={r.curve} />
          {r.note.map((n) => <div key={n} className="sub mt-1">※ {n}</div>)}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card">
          <div className="card-h"><span>今天符合進場條件<Help>用最新一天（{md(r.to)}）收盤資料檢查，照策略會在下個交易日開盤買；依優先順序排列。</Help></span><span className="sub font-normal">{r.today.length} 檔</span></div>
          <div className="scroll-y max-h-[360px] px-2 pb-2">
            <table className="tbl text-[13px]">
              <thead><tr><th>股票</th><th className="text-right">收盤</th><th className="text-right">漲跌</th><th className="text-right">成交值</th></tr></thead>
              <tbody>
                {r.today.map((x) => (
                  <tr key={x.code}>
                    <td><Link href={`/stock/${x.code}`} className="hover:text-[var(--gold)]"><span className="mono text-text-2 mr-1.5">{x.code}</span>{x.name}</Link></td>
                    <td className="text-right mono">{price(x.close)}</td>
                    <td className={`text-right mono ${cls(x.chg)}`}>{sp(x.chg)}</td>
                    <td className="text-right mono">{x.value.toFixed(1)} 億</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!r.today.length && <div className="sub text-center py-6">今天沒有股票符合</div>}
          </div>
        </div>
        <Trades title="交易紀錄" list={[...r.holding, ...r.list]} />
      </div>
    </>
  );
}

function Trades({ title, list }: { title: string; list: Trade[] }) {
  return (
    <div className="card">
      <div className="card-h"><span>{title}</span><span className="sub font-normal">新到舊 · 持有中在最上面</span></div>
      <div className="scroll-y max-h-[360px] px-2 pb-2">
        <table className="tbl text-[13px]">
          <thead><tr><th>股票</th><th>買進</th><th>賣出</th><th className="text-right">報酬</th><th>原因</th></tr></thead>
          <tbody>
            {list.map((t, i) => (
              <tr key={`${t.code}-${t.inDate}-${i}`}>
                <td><Link href={`/stock/${t.code}`} className="hover:text-[var(--gold)]"><span className="mono text-text-2 mr-1.5">{t.code}</span>{t.name}</Link></td>
                <td className="mono text-text-2">{md(t.inDate)} <span className="text-text">{price(t.inPrice)}</span></td>
                <td className="mono text-text-2">{t.outDate ? md(t.outDate) : "—"} <span className="text-text">{price(t.outPrice)}</span></td>
                <td className={`text-right mono ${cls(t.ret)}`}>{sp(t.ret)}</td>
                <td className="text-text-2 whitespace-nowrap">{t.why} · {t.days} 天</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="sub text-center py-6">這段期間沒有任何交易</div>}
      </div>
    </div>
  );
}

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
