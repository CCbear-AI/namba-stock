"use client";
// 分點進出：個股／全市場／河道／追蹤／換手／0050／隔日沖／排序（資料每晚掃一次各股買賣超前 15 名分點）
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { createChart, CandlestickSeries, HistogramSeries, LineStyle, type IChartApi, type Time } from "lightweight-charts";
import { localStore, useGroups, usePoll, useScan } from "@/components/hooks";
import { athRows, d20Rows, top50 } from "@/components/scopes";
import { cls, num, price } from "@/components/fmt";
import Help from "@/components/Help";
import ExportBtn from "@/components/ExportBtn";
import StockPicker from "@/components/StockPicker";

type K = "f" | "l";
type Cls = "rel" | "long" | "dip" | "chase" | "dt" | "bad" | "none";
type BRow = { id: string; n: string; k: K; cls: Cls; buy: number; sell: number; net: number; pct: number };
type Broker = { id: string; n: string; k: K; cls: Cls; net: number[]; sum: number; buyAvg: number | null; sellAvg: number | null; streak: number; rangeNet: number };
type HeatRow = { id: string; n: string; k: K; cls: Cls; net: number[]; sum: number; cost: number | null; buyDays: number; streak: number };
type SV = {
  error?: string; code: string; name: string; close: number; chg: number; from: string; to: string; days: number; dates: string[];
  bars: { date: string; o: number; h: number; l: number; c: number }[];
  buy: BRow[]; sell: BRow[]; buySum: number; sellSum: number; vol: number; buyPct: number; sellPct: number; top5Buy: number; top5Sell: number;
  conc: { pct: number; pctile: number | null; adjusted?: boolean; sellers: { n: string; pct: number }[]; buyers: { id: string; n: string; dots: boolean[] }[] };
  brokers: Broker[]; heat: { dates: string[]; rows: HeatRow[]; close: number };
  handoff: Handoff | null;
};
type Handoff = { sb: number; ss: number; fb: number; fs: number; sNet: number; fNet: number; gross: number; score: number; label: string; lead: string | null; leadF: string | null };
type Pair = { c: string; n: string; id: string; b: string; k: K; cls: Cls; lots: number; pct: number; amt: number; chg: number; prev: number };
type MV = { error?: string; date: string; dates: string[]; hot: { c: string; n: string; val: number; chg: number; top: { n: string; lots: number } | null; bot: { n: string; lots: number } | null }[]; bigBuy: Pair[]; bigSell: Pair[]; sudden: Pair[] };
type RRow = { id: string; n: string; k: K; cls: Cls; v: number; daily: number[]; move: number | null };
type RV = { error?: string; unit: string; code: string | null; name: string | null; n: number; from: string; to: string; dates: string[]; buy: RRow[]; sell: RRow[] };
type BV = { error?: string; id: string; name: string; k: K; cls: Cls; from: string; to: string; n: number; buy: { c: string; n: string; lots: number; amt: number }[]; sell: { c: string; n: string; lots: number; amt: number }[] };
type TV = { dates: string[]; rows: { c: string; n: string; id: string; b: string; k: K; cls: Cls; last10: number[]; sum5: number; sum20: number; streak: number; cost: number | null; close: number | null }[] };

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const sg = (v: number) => `${v > 0 ? "+" : ""}${num(v)}`;
const KC: Record<K, string> = { f: "#5b9cf0", l: "#c8d65a" };
const KN: Record<K, string> = { f: "外資", l: "本土" };
const DT = "#f0a14a"; // 隔日沖（橘）
const Dot = ({ k, c }: { k: K; c?: Cls }) => <span title={c === "dt" ? "隔日沖" : KN[k]} className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0" style={{ background: c === "dt" ? DT : KC[k] }} />;
const CN: Record<Cls, string> = { rel: "可靠放長", long: "放長", dip: "跌時買", chase: "追漲", dt: "隔日沖", bad: "壞分點", none: "" };
const STABLE: Cls[] = ["rel", "long", "dip"];
/** 分點分類小標：安定籌碼偏金、浮動籌碼灰、隔日沖橘 */
const CTag = ({ c }: { c?: Cls }) => (c && c !== "none" ? <span className="ml-1.5 text-[11px] shrink-0" style={{ color: c === "dt" ? DT : STABLE.includes(c) ? "var(--gold-2)" : "var(--text-2)" }}>{CN[c]}</span> : null);
const CLS_HELP = "分點分類（用近 70 個交易日各股前 15 名資料，每晚重算）：隔日沖＝買進的張數裡隔天就賣掉 25% 以上；壞分點＝買進後 10 天平均跑輸大盤 1.5% 以上；追漲＝七成以上買在上漲日；跌時買＝不到四成買在上漲日；可靠放長＝隔天幾乎不賣（≤10%）而且 5 天內大多沒賣回；放長＝其他。可靠放長、放長、跌時買算「安定籌碼」，追漲、隔日沖、壞分點算「浮動籌碼」；事件太少的是「沒成績」。";
const streakText = (s: number) => (s >= 2 ? `連買 ${s} 天` : s <= -2 ? `連賣 ${-s} 天` : "");

// 追蹤清單（存在這台裝置）
type Track = { c: string; id: string; b: string };
const trackStore = localStore<Track[]>("namba.brokerTrack", () => []);
const NO_TRACK: Track[] = [];
function useTrack() {
  const list = useSyncExternalStore(trackStore.subscribe, trackStore.read, () => NO_TRACK);
  const has = (c: string, id: string) => list.some((t) => t.c === c && t.id === id);
  return {
    list, has,
    toggle: (t: Track) => trackStore.write(has(t.c, t.id) ? list.filter((x) => !(x.c === t.c && x.id === t.id)) : [...list, t]),
  };
}

const TABS = [["stock", "個股"], ["market", "全市場"], ["river", "河道"], ["track", "追蹤"], ["handoff", "換手"], ["tw50", "0050"], ["dt", "隔日沖"], ["rank", "排序"]] as const;
type Tab = (typeof TABS)[number][0];

export default function Page() {
  return <Suspense><Brokers /></Suspense>;
}

function Brokers() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>((TABS.find(([t]) => t === sp.get("tab"))?.[0]) ?? "stock");
  const [code, setCode] = useState(sp.get("code") ?? "2330");
  const [broker, setBroker] = useState<{ id: string; n: string } | null>(null);
  useEffect(() => {
    // 分頁、股票寫進網址，重新整理或分享都會回到同一個畫面
    const u = new URL(location.href);
    u.searchParams.set("tab", tab);
    u.searchParams.set("code", code);
    history.replaceState(null, "", u);
  }, [tab, code]);
  const pick = (c: string) => { setCode(c); setTab("stock"); window.scrollTo({ top: 0 }); };
  return (
    <div className="grid gap-4" id="brokers-area">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[16px] font-semibold">分點進出<Help>每天收盤後掃描成交值夠的股票（近 20 日平均每天 1,000 萬以上，約 1,000 檔、不含 ETF），記下各檔買超、賣超前 15 名的券商分點，保留近 70 個交易日。沒進前 15 名的日子看不到、當作 0；金額＝張數 × 當天收盤價。只描述誰在買賣，不是買賣建議。</Help></h1>
        <div className="seg">{TABS.map(([t, l]) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{l}{t === "stock" ? ` ${code}` : ""}</button>)}</div>
        <StockPicker className="w-[260px]" placeholder="查股票：代號或名稱" onPick={pick} />
        <BrokerSearch onPick={setBroker} />
        <span className="ml-auto"><ExportBtn name="分點進出" target={() => document.getElementById("brokers-area")} /></span>
      </div>
      {tab === "stock" && <StockTab code={code} onBroker={setBroker} />}
      {tab === "market" && <MarketTab onStock={pick} onBroker={setBroker} />}
      {tab === "river" && <RiverTab code={code} onBroker={setBroker} />}
      {tab === "track" && <TrackTab code={code} onStock={pick} />}
      {tab === "handoff" && <HandoffTab onStock={pick} />}
      {tab === "tw50" && <Tw50Tab onStock={pick} />}
      {tab === "dt" && <DtTab onStock={pick} onBroker={setBroker} />}
      {tab === "rank" && <RankTab onStock={pick} />}
      {broker && <BrokerPanel b={broker} onClose={() => setBroker(null)} onStock={(c) => { setBroker(null); pick(c); }} />}
    </div>
  );
}

function BrokerSearch({ onPick }: { onPick: (b: { id: string; n: string }) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = usePoll<{ id: string; n: string }[]>(q.trim() ? `/api/brokers?view=find&q=${encodeURIComponent(q.trim())}` : null);
  const hits = q.trim() ? data ?? [] : [];
  return (
    <div className="relative w-[200px]">
      <input value={q} placeholder="查分點：凱基-台北、摩根" onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full bg-panel-2 border border-line rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--gold)]" />
      {open && hits.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 card overflow-hidden z-40">
          {hits.map((h) => <button key={h.id} onMouseDown={() => { onPick(h); setQ(""); }} className="w-full text-left px-3 py-2 hover:bg-panel-2">{h.n}</button>)}
        </div>
      )}
    </div>
  );
}

// ---------------- 個股 ----------------
function StockTab({ code, onBroker }: { code: string; onBroker: (b: { id: string; n: string }) => void }) {
  const [days, setDays] = useState<1 | 5 | 20>(5);
  const { data } = usePoll<SV>(`/api/brokers?view=stock&code=${code}&days=${days}`);
  if (!data) return <div className="sub py-20 text-center loading">分點資料載入中…</div>;
  if (data.error) return <div className="card sub py-16 text-center">{data.error}</div>;
  return (
    <div className="grid gap-4">
      <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
        <Link href={`/stock/${data.code}`} className="text-[18px] font-semibold hover:underline">{data.name}</Link>
        <span className="mono text-text-2">{data.code}</span>
        <span className={`mono text-[16px] ${cls(data.chg)}`}>{price(data.close)} <span className="text-[13px]">{data.chg > 0 ? "+" : ""}{data.chg.toFixed(2)}%</span></span>
        <span className="sub">{md(data.to)} 收盤</span>
        <div className="seg ml-2">{([1, 5, 20] as const).map((d) => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>近 {d} 日</button>)}</div>
        <span className="sub">{md(data.from)}–{md(data.to)}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px] items-start">
        <div className="grid gap-4 min-w-0">
          <BrokerK d={data} onBroker={onBroker} />
          <Heat d={data} onBroker={onBroker} />
        </div>
        <div className="grid gap-4">
          <Conc d={data} onBroker={onBroker} />
          {data.handoff && <HandoffCard h={data.handoff} />}
          <Compare d={data} />
          <Summary d={data} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Top15 rows={data.buy} side="buy" onBroker={onBroker} />
        <Top15 rows={data.sell} side="sell" onBroker={onBroker} />
      </div>
    </div>
  );
}

function BrokerK({ d, onBroker }: { d: SV; onBroker: (b: { id: string; n: string }) => void }) {
  const [selId, setSelId] = useState("");
  const [more, setMore] = useState(false);
  const tr = useTrack();
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  // 換股票後原本選的分點不在清單裡就回到第一家
  const top = d.brokers.find((x) => x.id === selId) ?? d.brokers[0];
  // 富邦單一分點明細（含沒進前 15 名的日子）比較完整，抓到就用它
  const { data: full } = usePoll<Omit<Broker, "k" | "rangeNet"> | null>(top ? `/api/brokers?view=bk&code=${d.code}&id=${encodeURIComponent(top.id)}` : null);
  const b = useMemo(() => (top && full?.id === top.id && full.net.length === d.dates.length ? { ...top, ...full } : top), [top, full, d.dates.length]);
  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      height: 340, autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#9aa0a8", fontSize: 11, attributionLogo: false, panes: { separatorColor: "#262a31" } },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, tickMarkFormatter: (t: Time) => (typeof t === "string" ? md(t) : typeof t === "object" ? `${t.month}/${t.day}` : "") },
      localization: { dateFormat: "MM/dd" },
    });
    chart.current = c;
    return () => { c.remove(); chart.current = null; };
  }, []);
  useEffect(() => {
    const c = chart.current;
    if (!c || !b) return;
    for (const p of c.panes().slice().reverse()) for (const s of p.getSeries()) c.removeSeries(s);
    const k = c.addSeries(CandlestickSeries, { upColor: "#f2554f", downColor: "#22b573", borderVisible: false, wickUpColor: "#f2554f", wickDownColor: "#22b573", priceLineVisible: false });
    k.setData(d.bars.filter((x) => x.c > 0).map((x) => ({ time: x.date, open: x.o, high: x.h, low: x.l, close: x.c })));
    if (b.buyAvg) k.createPriceLine({ price: b.buyAvg, color: "#f0d08a", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "買進均價" });
    if (b.sellAvg) k.createPriceLine({ price: b.sellAvg, color: "#9aa0a8", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "賣出均價" });
    const h = c.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "volume" } }, 1);
    h.setData(d.dates.map((t, i) => ({ time: t, value: b.net[i], color: b.net[i] >= 0 ? "#f2554f" : "#22b573" })));
    c.panes()[1]?.setStretchFactor(0.3);
    c.timeScale().fitContent();
  }, [d, b]);
  if (!b) return null;
  const shown = more ? d.brokers : d.brokers.slice(0, 10);
  const vsAvg = b.buyAvg ? ((d.close - b.buyAvg) / b.buyAvg) * 100 : null;
  const tracked = tr.has(d.code, b.id);
  return (
    <div className="card">
      <div className="card-h"><span>分點 K 線<Help>挑一家分點，看它近 {d.dates.length} 個交易日哪幾天買、哪幾天賣（下方長條，紅買綠賣），虛線是估算的買進／賣出均價（用每天收盤價估，當沖價差看不到）。分點依這段期間進出量排序。</Help></span>
        <button className={`btn ${tracked ? "on" : ""}`} onClick={() => tr.toggle({ c: d.code, id: b.id, b: b.n })}>{tracked ? "★ 已追蹤" : "☆ 追蹤這組"}</button>
      </div>
      <div className="px-4 flex flex-wrap gap-1.5">
        {shown.map((x) => (
          <button key={x.id} onClick={() => setSelId(x.id)} className={`btn !py-0.5 !px-2.5 ${x.id === top.id ? "on" : ""}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: x.rangeNet >= 0 ? "var(--up)" : "var(--down)" }} />{x.n}
          </button>
        ))}
        {d.brokers.length > 10 && <button className="btn !py-0.5 !px-2.5" onClick={() => setMore(!more)}>{more ? "收起" : `其他 ${d.brokers.length - 10} 家…`}</button>}
      </div>
      <div ref={box} className="mx-2 mt-2" style={{ height: 340 }} />
      <div className="px-4 pb-4 pt-2 grid grid-cols-2 sm:grid-cols-5 gap-3 text-[13px]">
        <Stat l={`${md(d.dates[0])}–${md(d.to)} 淨買`} v={`${sg(b.sum)} 張`} c={b.sum} />
        <Stat l="估算買進均價" v={b.buyAvg ? price(b.buyAvg) : "—"} />
        <Stat l="現價相對均價" v={vsAvg == null ? "—" : `${vsAvg > 0 ? "+" : ""}${vsAvg.toFixed(1)}%`} c={vsAvg ?? 0} />
        <Stat l="估算賣出均價" v={b.sellAvg ? price(b.sellAvg) : "—"} />
        <Stat l={b.streak < 0 ? "連賣" : "連買"} v={`${Math.abs(b.streak)} 天`} c={b.streak} />
      </div>
      <div className="px-4 pb-4 -mt-2"><button className="sub underline hover:text-text" onClick={() => onBroker({ id: b.id, n: b.n })}>看 {b.n} 還買了什麼</button></div>
    </div>
  );
}
const Stat = ({ l, v, c = 0 }: { l: string; v: string; c?: number }) => <div><div className="sub">{l}</div><div className={`mono text-[15px] font-semibold ${cls(c)}`}>{v}</div></div>;

function Heat({ d, onBroker }: { d: SV; onBroker: (b: { id: string; n: string }) => void }) {
  const { dates, rows, close } = d.heat;
  const max = Math.max(1, ...rows.flatMap((r) => r.net.map(Math.abs)));
  const cell = (v: number) => (v ? `color-mix(in srgb, ${v > 0 ? "var(--up)" : "var(--down)"} ${Math.round(15 + (Math.abs(v) / max) * 85)}%, transparent)` : "#1a1e24");
  return (
    <div className="card">
      <div className="card-h"><span>分點熱力圖 · 近 {dates.length} 日<Help>每家分點每天的買賣超，紅買綠賣、越深越多。看誰連著買、誰買完就倒、誰今天才進場。估算成本＝買超那幾天的收盤加權平均，後面是現價相對成本。</Help></span></div>
      <div className="scroll-x px-2 pb-3">
        <table className="tbl text-[12.5px]">
          <thead><tr><th>分點</th><th style={{ textAlign: "left" }}><div className="flex justify-between gap-2 min-w-[260px]">{dates.filter((_, i) => i % 5 === 0 || i === dates.length - 1).map((t) => <span key={t}>{md(t)}</span>)}</div></th><th>{dates.length} 日</th><th>估算成本</th><th>狀態</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="click" onClick={() => onBroker({ id: r.id, n: r.n })}>
              <td><span className="flex items-center"><Dot k={r.k} c={r.cls} />{r.n}<CTag c={r.cls} /></span></td>
              <td><div className="flex gap-[2px] min-w-[260px]">{r.net.map((v, i) => <span key={i} title={`${md(dates[i])} ${sg(v)} 張`} className="flex-1 h-4 rounded-[2px]" style={{ background: cell(v) }} />)}</div></td>
              <td className={`mono ${cls(r.sum)}`}>{sg(r.sum)}</td>
              <td className="mono">{r.cost ? <>{price(r.cost)} <span className={cls(close - r.cost)}>{(((close - r.cost) / r.cost) * 100).toFixed(1)}%</span></> : "—"}</td>
              <td className="sub">{streakText(r.streak) || (r.buyDays >= 5 ? `${r.buyDays} 天有買` : "—")}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function Conc({ d, onBroker }: { d: SV; onBroker: (b: { id: string; n: string }) => void }) {
  const c = d.conc;
  return (
    <div className="card">
      <div className="card-h"><span>賣方集中度 <span className="sub">{md(d.to)} 當天</span><Help align="right">前五大賣家（賣超最多的 5 家分點）合計賣掉當天成交量的百分比。百分位是先扣掉規模、漲跌、波動、位置、量能等 11 個價量因素後，在全市場同一天排第幾（越高＝比同類股票的賣方更集中）。只適合在你本來就想看的股票裡比先後，不是買賣訊號。</Help></span>
        {c.pctile != null && <span className="chip">第 {c.pctile} 百分位</span>}
      </div>
      <div className="px-4 pb-4 text-[13px] grid gap-3">
        <div className="flex items-center gap-3"><div className="flex-1 h-1.5 rounded bg-panel-2"><div className="h-full rounded bg-[var(--gold)]" style={{ width: `${c.pctile ?? 0}%` }} /></div><span className="mono">{c.pct.toFixed(1)}%</span></div>
        <div><div className="sub mb-1">前五大賣家（佔當天成交量）</div><div className="flex flex-wrap gap-x-3 gap-y-1">{c.sellers.map((s) => <span key={s.n}>{s.n} <span className="mono down">{s.pct.toFixed(1)}%</span></span>)}</div></div>
        <div><div className="sub mb-1">前五大買家（點點＝近 5 天哪幾天在買）</div><div className="flex flex-wrap gap-x-4 gap-y-1">{c.buyers.map((b) => (
          <button key={b.id} className="hover:underline flex items-center gap-1.5" onClick={() => onBroker(b)}>{b.n}<span className="flex gap-[3px]">{b.dots.map((on, i) => <i key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "var(--up)" : "#333840" }} />)}</span></button>
        ))}</div></div>
      </div>
    </div>
  );
}

function Compare({ d }: { d: SV }) {
  const diff = d.top5Buy - d.top5Sell;
  const side = (rows: BRow[], col: string) => rows.slice(0, 5).map((r) => <div key={r.id} className="flex justify-between py-1 border-t border-[#1c1f24]"><span className="flex items-center min-w-0 truncate"><Dot k={r.k} c={r.cls} />{r.n}<CTag c={r.cls} /></span><span className={`mono ${col}`}>{num(Math.abs(r.net))}</span></div>);
  return (
    <div className="card">
      <div className="card-h"><span>前五對照 <span className="sub">這段期間，張</span></span><span className="text-[13px]">差額 <span className={`mono ${cls(diff)}`}>{sg(diff)}</span> <span className="sub">{diff >= 0 ? "買的多" : "賣的多"}</span></span></div>
      <div className="px-4 pb-4 grid grid-cols-2 gap-4 text-[13px]">
        <div><div className="flex justify-between sub mb-1"><span>買方前五</span><span className="mono up">{num(d.top5Buy)} 張</span></div>{side(d.buy, "up")}</div>
        <div><div className="flex justify-between sub mb-1"><span>賣方前五</span><span className="mono down">{num(d.top5Sell)} 張</span></div>{side(d.sell, "down")}</div>
      </div>
    </div>
  );
}

function Summary({ d }: { d: SV }) {
  const conc = d.buyPct - d.sellPct;
  return (
    <div className="card px-4 py-3 grid grid-cols-2 gap-3 text-[13px]">
      <Stat l={`買超合計（佔成交量 ${d.buyPct.toFixed(1)}%）`} v={`${num(d.buySum)} 張`} c={1} />
      <Stat l={`賣超合計（佔成交量 ${d.sellPct.toFixed(1)}%）`} v={`${num(d.sellSum)} 張`} c={-1} />
      <div><div className="sub">集中度<Help>買超前 15 名佔成交量 − 賣超前 15 名佔成交量。正值＝買方比較集中。</Help></div><div className={`mono text-[15px] font-semibold ${cls(conc)}`}>{conc > 0 ? "+" : ""}{conc.toFixed(1)}%</div></div>
      <Stat l={`主力買賣超（近 ${d.days} 日）`} v={`${sg(d.buySum - d.sellSum)} 張`} c={d.buySum - d.sellSum} />
    </div>
  );
}

function Top15({ rows, side, onBroker }: { rows: BRow[]; side: "buy" | "sell"; onBroker: (b: { id: string; n: string }) => void }) {
  return (
    <div className="card">
      <div className="card-h"><span className={side === "buy" ? "up" : "down"}>{side === "buy" ? "買超" : "賣超"}前 15 名<Help>{CLS_HELP}</Help></span><span className="sub">橘色＝隔日沖型 · 點分點看它還買了什麼</span></div>
      <div className="px-2 pb-2">
        <table className="tbl text-[13px]">
          <thead><tr><th>分點</th><th>買進</th><th>賣出</th><th>{side === "buy" ? "買超" : "賣超"}</th><th>佔成交量</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="click" onClick={() => onBroker(r)}>
              <td><span className="flex items-center"><Dot k={r.k} c={r.cls} />{r.n}<CTag c={r.cls} /></span></td>
              <td className="mono">{num(r.buy)}</td><td className="mono">{num(r.sell)}</td>
              <td className={`mono ${cls(r.net)}`}>{num(Math.abs(r.net))}</td><td className="mono">{Math.abs(r.pct).toFixed(1)}%</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- 全市場 ----------------
const MKT = [["hot", "成交熱門"], ["bigBuy", "大額買超"], ["bigSell", "大額賣超"], ["sudden", "突然大買"]] as const;
const MKT_HELP: Record<(typeof MKT)[number][0], string> = {
  hot: "今天成交值最大的股票，各自今天買超、賣超最多的分點。看大戶是在接還是在倒。",
  bigBuy: "今天金額最大的「股票＋分點」買超組合，看大錢今天進了哪裡。「前 5 天」＝這家分點前 5 個交易日有幾天也在買這檔。",
  bigSell: "今天金額最大的「股票＋分點」賣超組合。「前 5 天」＝這家分點前 5 個交易日有幾天也在賣這檔。",
  sudden: "一家分點就買掉當天成交量 15% 以上，而且前 5 個交易日都沒在買這檔。",
};
function MarketTab({ onStock, onBroker }: { onStock: (c: string) => void; onBroker: (b: { id: string; n: string }) => void }) {
  const [k, setK] = useState<(typeof MKT)[number][0]>("bigBuy");
  const [date, setDate] = useState("");
  const { data } = usePoll<MV>(`/api/brokers?view=market${date ? `&date=${date}` : ""}`);
  if (!data) return <div className="sub py-20 text-center loading">分點資料載入中…</div>;
  if (data.error) return <div className="card sub py-16 text-center">{data.error}</div>;
  const pairs = k === "hot" ? [] : data[k];
  return (
    <div className="card">
      <div className="card-h" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <div className="seg">{MKT.map(([id, l]) => <button key={id} className={k === id ? "on" : ""} onClick={() => setK(id)}>{l}{id === "sudden" ? ` ${data.sudden.length}` : ""}</button>)}</div>
        <select value={data.date} onChange={(e) => setDate(e.target.value)} className="bg-panel-2 border border-line rounded-lg px-2 py-1 text-[13px] mono">
          {data.dates.slice().reverse().map((t) => <option key={t} value={t}>{t.replace(/-/g, "/")}</option>)}
        </select>
        <span className="sub">{MKT_HELP[k]}</span>
      </div>
      <div className="scroll-x px-2 pb-3">
        {k === "hot" ? (
          <table className="tbl text-[13px]">
            <thead><tr><th>#</th><th style={{ textAlign: "left" }}>股票</th><th>成交值（億）</th><th>當天漲跌</th><th style={{ textAlign: "left" }}>最大買家（張）</th><th style={{ textAlign: "left" }}>最大賣家（張）</th></tr></thead>
            <tbody>{data.hot.map((r, i) => (
              <tr key={r.c} className="click" onClick={() => onStock(r.c)}>
                <td className="sub">{i + 1}</td><td style={{ textAlign: "left" }}>{r.n} <span className="mono sub">{r.c}</span></td>
                <td className="mono">{num(r.val, 1)}</td><td className={`mono ${cls(r.chg)}`}>{r.chg > 0 ? "+" : ""}{r.chg.toFixed(1)}%</td>
                <td style={{ textAlign: "left" }}>{r.top ? <>{r.top.n} <span className="mono up">{num(r.top.lots)}</span></> : "—"}</td>
                <td style={{ textAlign: "left" }}>{r.bot ? <>{r.bot.n} <span className="mono down">{num(r.bot.lots)}</span></> : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : !pairs.length ? <div className="sub py-10 text-center">這天沒有符合的組合</div> : (
          <table className="tbl text-[13px]">
            <thead><tr><th>#</th><th style={{ textAlign: "left" }}>股票</th><th style={{ textAlign: "left" }}>分點</th><th>張數</th><th>佔成交量</th><th>金額（億）</th><th>當天漲跌</th><th>前 5 天</th></tr></thead>
            <tbody>{pairs.map((r, i) => (
              <tr key={r.c + r.id} className="click" onClick={() => onStock(r.c)}>
                <td className="sub">{i + 1}</td><td style={{ textAlign: "left" }}>{r.n} <span className="mono sub">{r.c}</span></td>
                <td style={{ textAlign: "left" }}><button className="flex items-center hover:underline" onClick={(e) => { e.stopPropagation(); onBroker({ id: r.id, n: r.b }); }}><Dot k={r.k} c={r.cls} />{r.b}</button></td>
                <td className={`mono ${cls(r.lots)}`}>{num(Math.abs(r.lots))}</td><td className="mono">{r.pct.toFixed(1)}%</td>
                <td className="mono">{Math.abs(r.amt).toFixed(2)}</td><td className={`mono ${cls(r.chg)}`}>{r.chg > 0 ? "+" : ""}{r.chg.toFixed(1)}%</td>
                <td className="sub">{r.prev ? `${r.prev} 天也有` : "新出現"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------- 河道 ----------------
function RiverTab({ code, onBroker }: { code: string; onBroker: (b: { id: string; n: string }) => void }) {
  const [scope, setScope] = useState<"all" | "stock">("all");
  const [n, setN] = useState(5);
  const [to, setTo] = useState<string | null>(null);
  const [play, setPlay] = useState(false);
  const { data } = usePoll<RV>(`/api/brokers?view=river&days=${n}${scope === "stock" ? `&code=${code}` : ""}${to ? `&to=${to}` : ""}`);
  const dates = useMemo(() => data?.dates ?? [], [data]);
  const at = to ? dates.indexOf(to) : dates.length - 1;
  useEffect(() => {
    // 回放：一天一天往後推
    if (!play || !dates.length) return;
    const t = setTimeout(() => { if (at >= dates.length - 1) setPlay(false); else setTo(dates[at + 1]); }, 900);
    return () => clearTimeout(t);
  }, [play, at, dates]);
  if (!data) return <div className="sub py-20 text-center loading">分點資料載入中…</div>;
  if (data.error) return <div className="card sub py-16 text-center">{data.error}</div>;
  const rows = [...data.buy, ...data.sell.slice().reverse()];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v)));
  const fmtV = (v: number) => (data.unit === "億" ? `${v > 0 ? "+" : ""}${v.toFixed(2)} 億` : `${sg(Math.round(v))} 張`);
  return (
    <div className="card">
      <div className="card-h" style={{ flexWrap: "wrap" }}>
        <span>分點河道 <span className="sub">{scope === "stock" ? `${data.name} ${code} · ` : ""}{md(data.from)}–{md(data.to)} 淨買賣</span><Help>這段期間各分點的淨買賣，往右是買、往左是賣，越長進出越大；全市場用金額（張數 × 當天收盤，億），個股用張數。▲▼＝跟前一天同長度區間相比名次的變化。點一列看這家分點買了什麼。</Help></span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg">{([["all", "全市場"], ["stock", `個股 ${code}`]] as const).map(([id, l]) => <button key={id} className={scope === id ? "on" : ""} onClick={() => setScope(id)}>{l}</button>)}</div>
          <div className="seg">{[5, 10, 25].map((d) => <button key={d} className={n === d ? "on" : ""} onClick={() => setN(d)}>近 {d} 日</button>)}</div>
          <span className="sub flex items-center gap-2"><Dot k="f" />外資 <Dot k="l" />本土 <Dot k="l" c="dt" />隔日沖</span>
        </div>
      </div>
      <div className="px-4 pb-2 text-[13px]">
        {rows.map((r) => {
          const w = (Math.abs(r.v) / max) * 50;
          return (
            <div key={r.id} className="click grid grid-cols-[150px_1fr_110px] items-center gap-2 py-1 hover:bg-panel-2 rounded cursor-pointer" onClick={() => onBroker(r)}>
              <span className="flex items-center min-w-0"><Dot k={r.k} c={r.cls} /><span className="truncate">{r.n}</span>{r.move ? <span className={`ml-1 text-[11px] ${r.move > 0 ? "up" : "down"}`}>{r.move > 0 ? "▲" : "▼"}{Math.abs(r.move)}</span> : null}</span>
              <div className="relative h-3">
                <div className="absolute top-0 bottom-0 left-1/2 border-l border-line" />
                <div className="absolute top-0 bottom-0 rounded" style={{ left: r.v >= 0 ? "50%" : `${50 - w}%`, width: `${w}%`, background: r.v >= 0 ? "linear-gradient(90deg, #f2554f33, #f2554f)" : "linear-gradient(270deg, #22b57333, #22b573)" }} />
              </div>
              <span className={`mono text-right ${cls(r.v)}`}>{fmtV(r.v)}</span>
            </div>
          );
        })}
      </div>
      <div className="px-4 pb-4 flex items-center gap-3">
        <button className="btn" onClick={() => { if (!play && at >= dates.length - 1) setTo(dates[Math.min(n, dates.length - 1)]); setPlay(!play); }}>{play ? "❚❚ 暫停" : "▶ 回放"}</button>
        <input type="range" min={Math.min(n - 1, dates.length - 1)} max={dates.length - 1} value={at} onChange={(e) => { setPlay(false); setTo(dates[Number(e.target.value)]); }} className="flex-1 accent-[var(--gold)]" />
        <span className="mono sub w-12 text-right">{md(dates[at] ?? data.to)}</span>
      </div>
    </div>
  );
}

// ---------------- 追蹤 ----------------
function TrackTab({ code, onStock }: { code: string; onStock: (c: string) => void }) {
  const tr = useTrack();
  const [c, setC] = useState(code);
  const { data: sv } = usePoll<SV>(`/api/brokers?view=stock&code=${c}&days=5`);
  const items = useMemo(() => tr.list.map((t) => `${t.c}:${t.id}`).join(","), [tr.list]);
  const { data } = usePoll<TV>(items ? `/api/brokers?view=track&items=${items}` : null);
  return (
    <div className="grid gap-4">
      <div className="card px-4 py-3 grid gap-2">
        <div className="flex flex-wrap items-center gap-3"><span className="font-semibold">新增追蹤</span><span className="sub">選一檔股票，再點分點就加入（也可以在「個股」的分點 K 線按「追蹤這組」）</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <StockPicker className="w-[240px]" keep placeholder={`股票：${c}`} onPick={setC} />
          {sv?.error && <span className="sub">{sv.error}</span>}
          {sv && !sv.error && sv.brokers.slice(0, 16).map((b) => (
            <button key={b.id} className={`btn !py-0.5 !px-2.5 ${tr.has(sv.code, b.id) ? "on" : ""}`} onClick={() => tr.toggle({ c: sv.code, id: b.id, b: b.n })}>{tr.has(sv.code, b.id) ? "★" : "+"} {b.n}</button>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-h"><span>我的追蹤 <span className="sub">{tr.list.length} 組 · 存在這台裝置</span></span></div>
        {!tr.list.length ? <div className="sub py-10 text-center">還沒有追蹤任何「股票＋分點」。之後每天在這裡看它買了幾張、連買幾天，不用一檔一檔查。</div> : !data ? <div className="sub py-10 text-center loading">載入中…</div> : (
          <div className="scroll-x px-2 pb-3">
            <table className="tbl text-[13px]">
              <thead><tr><th>股票</th><th style={{ textAlign: "left" }}>分點</th><th style={{ textAlign: "left" }}>近 10 日（{md(data.dates[0])}–{md(data.dates.at(-1)!)}）</th><th>今天</th><th>近 5 日</th><th>近 20 日</th><th>狀態</th><th>估算成本</th><th /></tr></thead>
              <tbody>{data.rows.map((r) => {
                const max = Math.max(1, ...r.last10.map(Math.abs));
                return (
                  <tr key={r.c + r.id} className="click" onClick={() => onStock(r.c)}>
                    <td>{r.n} <span className="mono sub">{r.c}</span></td>
                    <td style={{ textAlign: "left" }}><span className="flex items-center"><Dot k={r.k} c={r.cls} />{r.b}</span></td>
                    <td><div className="flex items-center gap-[3px] h-6 min-w-[150px]">{r.last10.map((v, i) => <span key={i} title={`${md(data.dates[i])} ${sg(v)} 張`} className="flex-1 flex flex-col justify-center h-full"><span className="rounded-[2px] mx-auto w-full" style={{ height: `${Math.max(2, (Math.abs(v) / max) * 100)}%`, background: v > 0 ? "var(--up)" : v < 0 ? "var(--down)" : "#333840" }} /></span>)}</div></td>
                    <td className={`mono ${cls(r.last10.at(-1) ?? 0)}`}>{sg(r.last10.at(-1) ?? 0)}</td>
                    <td className={`mono ${cls(r.sum5)}`}>{sg(r.sum5)}</td><td className={`mono ${cls(r.sum20)}`}>{sg(r.sum20)}</td>
                    <td className="sub">{streakText(r.streak) || "—"}</td>
                    <td className="mono">{r.cost && r.close ? <>{price(r.cost)} <span className={cls(r.close - r.cost)}>{(((r.close - r.cost) / r.cost) * 100).toFixed(1)}%</span></> : "—"}</td>
                    <td><button aria-label="取消追蹤" className="sub hover:text-text px-1" onClick={(e) => { e.stopPropagation(); tr.toggle({ c: r.c, id: r.id, b: r.b }); }}>✕</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- 分點買了什麼（浮出面板） ----------------
function BrokerPanel({ b, onClose, onStock }: { b: { id: string; n: string }; onClose: () => void; onStock: (c: string) => void }) {
  const [n, setN] = useState(1);
  const { data } = usePoll<BV>(`/api/brokers?view=broker&id=${encodeURIComponent(b.id)}&days=${n}`);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const list = (rows: BV["buy"], side: "buy" | "sell") => (
    <table className="tbl text-[13px]">
      <thead><tr><th>{side === "buy" ? <span className="up">買超</span> : <span className="down">賣超</span>}</th><th>張數</th><th>金額（億）</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.c} className="click" onClick={() => onStock(r.c)}><td>{r.n} <span className="mono sub">{r.c}</span></td><td className={`mono ${cls(r.lots)}`}>{num(Math.abs(r.lots))}</td><td className="mono">{Math.abs(r.amt).toFixed(2)}</td></tr>)}</tbody>
    </table>
  );
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="card w-full max-w-[860px] mt-16" onClick={(e) => e.stopPropagation()}>
        <div className="card-h">
          <span className="flex items-center">{data && !data.error && <Dot k={data.k} c={data.cls} />}{data?.name ?? b.n}{data && !data.error && <CTag c={data.cls} />} 買賣了什麼 {data && !data.error && <span className="sub ml-2">{md(data.from)}–{md(data.to)}</span>}</span>
          <div className="flex items-center gap-2">
            <div className="seg">{[1, 5, 20].map((d) => <button key={d} className={n === d ? "on" : ""} onClick={() => setN(d)}>{d === 1 ? "最新一天" : `近 ${d} 日`}</button>)}</div>
            <button aria-label="關閉" className="sub hover:text-text text-[18px] px-1" onClick={onClose}>✕</button>
          </div>
        </div>
        {!data ? <div className="sub py-10 text-center loading">載入中…</div> : data.error ? <div className="sub py-10 text-center">{data.error}</div> : (
          <div className="grid gap-4 md:grid-cols-2 px-2 pb-3">{list(data.buy, "buy")}{list(data.sell, "sell")}</div>
        )}
        <div className="sub px-4 pb-3">只算得到這家分點有進各股前 15 名的日子；點一列看那檔股票的分點。</div>
      </div>
    </div>
  );
}

// ---------------- 換手（安定／浮動籌碼） ----------------
const HANDOFF_HELP = "把這一週（近 5 個交易日）買賣雙方依分點分類分成「安定籌碼」（可靠放長、放長、跌時買）和「浮動籌碼」（追漲、隔日沖、壞分點）。分數＝（安定淨買 − 浮動淨買）÷ 雙方進出總量，−100～100：放長的在接、短線的在出＝變安定（≥20）；反過來＝變浮動（≤−20）。";
function Bars4({ sb, fb, ss, fs }: { sb: number; fb: number; ss: number; fs: number }) {
  const max = Math.max(1, sb + fb, ss + fs);
  const seg = (v: number, c: string) => <span style={{ width: `${(v / max) * 100}%`, background: c }} className="h-full" />;
  return (
    <div className="grid gap-[2px] min-w-[120px]" title={`安定買 ${num(sb)}、浮動買 ${num(fb)}／安定賣 ${num(ss)}、浮動賣 ${num(fs)}`}>
      <div className="flex h-2 rounded overflow-hidden bg-panel-2">{seg(sb, "var(--up)")}{seg(fb, "#f2554f66")}</div>
      <div className="flex h-2 rounded overflow-hidden bg-panel-2">{seg(ss, "var(--down)")}{seg(fs, "#22b57366")}</div>
    </div>
  );
}
function HandoffCard({ h }: { h: Handoff }) {
  return (
    <div className="card">
      <div className="card-h"><span>換手品質 <span className="sub">這一週</span><Help align="right">{HANDOFF_HELP}</Help></span><span className={`chip ${h.score >= 20 ? "" : "!bg-panel-2 !text-text-2"}`}>{h.label} {h.score > 0 ? "+" : ""}{h.score}</span></div>
      <div className="px-4 pb-4 text-[13px] grid gap-2">
        <Bars4 sb={h.sb} fb={h.fb} ss={h.ss} fs={h.fs} />
        <div className="sub">上條買（深＝安定、淺＝浮動）· 下條賣</div>
        <div>安定籌碼 買 <span className="mono up">{num(h.sb)}</span>／賣 <span className="mono down">{num(h.ss)}</span>；浮動籌碼 買 <span className="mono up">{num(h.fb)}</span>／賣 <span className="mono down">{num(h.fs)}</span> 張</div>
        <div className="sub">{h.score >= 20 ? `籌碼往放長的手上走${h.lead ? `（${h.lead} 領頭）` : ""}，拉回比較有人接。` : h.score <= -20 ? `籌碼往短線的手上走${h.leadF ? `（${h.leadF} 領頭）` : ""}，追價要小心。` : "兩邊差不多，看不出換手方向。"}</div>
      </div>
    </div>
  );
}
type HRow = { c: string; n: string; score: number; amt: number; sb: number; ss: number; fb: number; fs: number; lead: string | null; d20: number };
function HandoffTab({ onStock }: { onStock: (c: string) => void }) {
  const { data } = usePoll<{ error?: string; date: string; from: string; stable: HRow[]; float: HRow[] }>("/api/brokers?view=handoff");
  if (!data) return <div className="sub py-20 text-center loading">分點資料載入中…</div>;
  if (data.error) return <div className="card sub py-16 text-center">{data.error}</div>;
  const table = (rows: HRow[], title: string, sub: string, up: boolean) => (
    <div className="card">
      <div className="card-h"><span className={up ? "up" : "down"}>{title} <span className="sub">{sub}</span></span><span className="sub">{md(data.from)}–{md(data.date)}</span></div>
      <div className="scroll-x px-2 pb-3">
        <table className="tbl text-[13px]">
          <thead><tr><th>股票</th><th style={{ textAlign: "left" }}>上買下賣（億）</th><th>分數</th><th style={{ textAlign: "left" }}>領頭</th><th>進出（億）</th><th>前 20 天</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.c} className="click" onClick={() => onStock(r.c)}>
              <td>{r.n} <span className="mono sub">{r.c}</span></td>
              <td><Bars4 sb={r.sb} fb={r.fb} ss={r.ss} fs={r.fs} /></td>
              <td className={`mono ${cls(r.score)}`}>{r.score > 0 ? "+" : ""}{r.score}</td>
              <td style={{ textAlign: "left" }}>{r.lead ?? "—"}</td>
              <td className="mono">{r.amt.toFixed(1)}</td>
              <td className={`mono ${cls(r.d20)}`}>{r.d20 > 0 ? "+" : ""}{r.d20.toFixed(1)}%</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
  return (
    <div className="grid gap-4">
      <div className="card px-4 py-3 text-[13px] flex items-center gap-1">籌碼在往誰的手上走<Help>{HANDOFF_HELP} 只看近 20 日平均每天成交 1 億以上、這週雙方進出 1 億以上的股票。</Help><span className="sub ml-2">分點怎麼分類</span><Help>{CLS_HELP}</Help></div>
      <div className="grid gap-4 xl:grid-cols-2">
        {table(data.stable, "籌碼變安定", "放長的在接、短線的在出", true)}
        {table(data.float, "籌碼變浮動", "短線的在接、放長的在出", false)}
      </div>
    </div>
  );
}

// ---------------- 0050 成分股換手 ----------------
type WRow = { c: string; n: string; score: number; sNet: number; fNet: number; grp: "long" | "both" | "short" | "out"; streak: number };
type WV = { error?: string; date: string; from: string; dates: string[]; total: { sNet: number; fNet: number; score: number; label: string }; missing: string[]; rows: WRow[] };
const GRP = [["long", "長線接手", "安定籌碼淨買、浮動籌碼淨賣"], ["both", "一起買", "安定、浮動籌碼都淨買"], ["short", "短線接手", "浮動籌碼淨買、安定籌碼淨賣"], ["out", "一起賣", "安定、浮動籌碼都淨賣"]] as const;
function Tw50Tab({ onStock }: { onStock: (c: string) => void }) {
  const { data: scan } = useScan(0);
  const codes = useMemo(() => (scan ? top50(scan.rows).map((r) => r.c).join(",") : ""), [scan]);
  const [to, setTo] = useState<string | null>(null);
  const [play, setPlay] = useState(false);
  const { data } = usePoll<WV>(codes ? `/api/brokers?view=tw50&codes=${codes}${to ? `&to=${to}` : ""}` : null);
  const dates = useMemo(() => data?.dates ?? [], [data]);
  const at = to ? dates.indexOf(to) : dates.length - 1;
  useEffect(() => {
    if (!play || !dates.length) return;
    const t = setTimeout(() => { if (at >= dates.length - 1) setPlay(false); else setTo(dates[at + 1]); }, 900);
    return () => clearTimeout(t);
  }, [play, at, dates]);
  if (!data) return <div className="sub py-20 text-center loading">分點資料載入中…</div>;
  if (data.error) return <div className="card sub py-16 text-center">{data.error}</div>;
  const t = data.total;
  const max = Math.max(1, ...data.rows.map((r) => Math.abs(r.score)));
  return (
    <div className="grid gap-4">
      <div className="card px-4 py-3 grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">0050 成分股：籌碼在往誰的手上走</span><span className="sub">{md(data.from)}–{md(data.date)} · 近 5 日</span>
          <Help>把每一檔每天買賣超前 15 名的分點分成安定籌碼（可靠放長、放長、跌時買）和浮動籌碼（追漲、隔日沖、壞分點），加總近 5 日，看兩邊各自淨買還是淨賣：安定買、浮動賣＝長線接手；反過來＝短線接手。按回放看這段期間怎麼輪動。0050 成分股用上市市值前 50 大。</Help>
        </div>
        <div className="flex flex-wrap gap-6 text-[13px]">
          <span>整體 <span className="chip">{t.label} {t.score > 0 ? "+" : ""}{t.score}</span></span>
          <span>安定籌碼淨買 <span className={`mono ${cls(t.sNet)}`}>{sg(t.sNet)}</span> 張</span>
          <span>浮動籌碼淨買 <span className={`mono ${cls(t.fNet)}`}>{sg(t.fNet)}</span> 張</span>
          {data.missing.length > 0 && <span className="sub">沒有分點資料：{data.missing.join("、")}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" onClick={() => { if (!play && at >= dates.length - 1) setTo(dates[0]); setPlay(!play); }}>{play ? "❚❚ 暫停" : "▶ 回放"}</button>
          <input type="range" min={0} max={dates.length - 1} value={at} onChange={(e) => { setPlay(false); setTo(dates[Number(e.target.value)]); }} className="flex-1 accent-[var(--gold)]" />
          <span className="mono sub w-12 text-right">{md(dates[at] ?? data.date)}</span>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {GRP.map(([g, title, sub]) => {
          const rows = data.rows.filter((r) => r.grp === g);
          return (
            <div key={g} className="card">
              <div className="card-h"><span>{title} <span className="sub">{rows.length} 檔 · {sub}</span></span></div>
              <div className="px-4 pb-3 text-[13px]">
                {!rows.length ? <div className="sub py-4">沒有</div> : rows.map((r) => {
                  const w = (Math.abs(r.score) / max) * 50;
                  return (
                    <div key={r.c} className="click grid grid-cols-[120px_1fr_48px] items-center gap-2 py-1 hover:bg-panel-2 rounded cursor-pointer" onClick={() => onStock(r.c)} title={`安定淨買 ${sg(r.sNet)} 張、浮動淨買 ${sg(r.fNet)} 張`}>
                      <span className="truncate">{r.n}{r.streak > 1 && <span className="sub ml-1">{r.streak} 天</span>}</span>
                      <div className="relative h-2.5"><div className="absolute top-0 bottom-0 left-1/2 border-l border-line" /><div className="absolute top-0 bottom-0 rounded" style={{ left: r.score >= 0 ? "50%" : `${50 - w}%`, width: `${w}%`, background: r.score >= 0 ? "var(--gold)" : "#8a8f98" }} /></div>
                      <span className={`mono text-right ${cls(r.score)}`}>{r.score > 0 ? "+" : ""}{r.score}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sub px-1">線往右＝安定籌碼買得多、往左＝浮動籌碼買得多（不是買或賣）；「N 天」＝連續幾天在同一組。</div>
    </div>
  );
}

// ---------------- 隔日沖 ----------------
type DV = {
  error?: string; date: string; prev: string | null; statFrom: string;
  today: { c: string; n: string; pct: number; g: string; lots: number; amt: number; chg: number; who: string[]; more: number }[];
  dumped: { c: string; n: string; bought: number; sold: number; ratio: number; chg: number; who: string[] }[];
  stats: { label: string; n: number; open: number; close: number; fade: number }[];
  list: { id: string; n: string; sell1: number; recent: number; cnt: number; k: number; amt: number }[];
};
function DtTab({ onStock, onBroker }: { onStock: (c: string) => void; onBroker: (b: { id: string; n: string }) => void }) {
  const [k, setK] = useState<"today" | "dumped" | "list">("today");
  const { data } = usePoll<DV>("/api/brokers?view=dt");
  if (!data) return <div className="sub py-20 text-center loading">分點資料載入中…</div>;
  if (data.error) return <div className="card sub py-16 text-center">{data.error}</div>;
  const pc = (v: number) => <span className={`mono ${cls(v)}`}>{v > 0 ? "+" : ""}{v.toFixed(2)}%</span>;
  const desc = k === "today" ? `${md(data.date)} 收盤 · 今天隔日沖分點買超的股票，依「買掉近 20 天平均成交量幾 %」排（高 ≥20%、中 10–20%、低 5–10%）。這些貨常常隔天一開盤就賣，追價要小心開高走低。`
    : k === "dumped" ? `${data.prev ? md(data.prev) : ""} 隔日沖分點買的，${md(data.date)} 那幾家賣了多少（只看得到賣超前 15 名，實際可能倒更多）。`
    : "隔日沖分點：買進的張數裡隔天就賣掉的比例高（外資不算）。點名字看它今天買了什麼。";
  return (
    <div className="grid gap-4">
      <div className="card">
        <div className="card-h" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <div className="seg">{([["today", `明天要倒的 ${data.today.length}`], ["dumped", "倒了沒"], ["list", "名單"]] as const).map(([id, l]) => <button key={id} className={k === id ? "on" : ""} onClick={() => setK(id)}>{l}</button>)}</div>
          <span className="sub">{desc}</span>
          <Help align="right">{CLS_HELP}</Help>
        </div>
        <div className="scroll-x px-2 pb-3">
          {k === "today" && (
            <table className="tbl text-[13px]">
              <thead><tr><th>#</th><th style={{ textAlign: "left" }}>股票</th><th>佔均量</th><th>買超張數</th><th>金額（億）</th><th>今天漲跌</th><th style={{ textAlign: "left" }}>誰買的</th></tr></thead>
              <tbody>{data.today.map((r, i) => (
                <tr key={r.c} className="click" onClick={() => onStock(r.c)}>
                  <td className="sub">{i + 1}</td><td style={{ textAlign: "left" }}>{r.n} <span className="mono sub">{r.c}</span></td>
                  <td className="mono"><span className="mr-1.5 text-[11px]" style={{ color: r.g === "高" ? DT : "var(--text-2)" }}>{r.g}</span>{r.pct.toFixed(1)}%</td>
                  <td className="mono">{num(r.lots)}</td><td className="mono">{r.amt.toFixed(2)}</td><td className={`mono ${cls(r.chg)}`}>{r.chg > 0 ? "+" : ""}{r.chg.toFixed(1)}%</td>
                  <td style={{ textAlign: "left", color: DT }}>{r.who.join("、")}{r.more ? <span className="sub"> +{r.more}</span> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {k === "dumped" && (
            <table className="tbl text-[13px]">
              <thead><tr><th style={{ textAlign: "left" }}>股票</th><th>昨天買超</th><th>今天賣出</th><th>倒了</th><th>今天漲跌</th><th style={{ textAlign: "left" }}>誰買的</th></tr></thead>
              <tbody>{data.dumped.map((r) => (
                <tr key={r.c} className="click" onClick={() => onStock(r.c)}>
                  <td style={{ textAlign: "left" }}>{r.n} <span className="mono sub">{r.c}</span></td>
                  <td className="mono up">{num(r.bought)}</td><td className="mono down">{num(r.sold)}</td>
                  <td><div className="flex items-center gap-2 justify-end"><div className="w-16 h-1.5 rounded bg-panel-2"><div className="h-full rounded" style={{ width: `${r.ratio}%`, background: DT }} /></div><span className="mono w-12">{r.ratio.toFixed(0)}%</span></div></td>
                  <td className={`mono ${cls(r.chg)}`}>{r.chg > 0 ? "+" : ""}{r.chg.toFixed(1)}%</td>
                  <td style={{ textAlign: "left", color: DT }}>{r.who.join("、")}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {k === "list" && (
            <table className="tbl text-[13px]">
              <thead><tr><th>#</th><th style={{ textAlign: "left" }}>分點</th><th>隔日賣出率</th><th>近 25 天</th><th>買進次數</th><th>今天買幾檔</th><th>今天買超（億）</th></tr></thead>
              <tbody>{data.list.map((r, i) => (
                <tr key={r.id} className="click" onClick={() => onBroker(r)}>
                  <td className="sub">{i + 1}</td><td style={{ textAlign: "left", color: DT }}>{r.n}</td>
                  <td className="mono">{r.sell1.toFixed(1)}%</td><td className="mono">{r.recent.toFixed(1)}%</td><td className="mono">{num(r.cnt)}</td><td className="mono">{r.k}</td><td className="mono">{r.amt.toFixed(2)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-h"><span>隔日沖買完的隔天 <span className="sub">{md(data.statFrom)} 起，依當天買掉均量幾 % 分三段，跟全部股票比</span></span></div>
        <div className="px-2 pb-3">
          <table className="tbl text-[13px]">
            <thead><tr><th>佔均量</th><th>次數</th><th>隔天開盤</th><th>隔天收盤</th><th>收在開盤下（開高走低）</th></tr></thead>
            <tbody>{data.stats.map((r) => <tr key={r.label} className={r.label === "全部股票" ? "[&>td]:text-text-2" : ""}><td>{r.label}</td><td className="mono">{num(r.n)}</td><td>{pc(r.open)}</td><td>{pc(r.close)}</td><td className="mono">{r.fade}%</td></tr>)}</tbody>
          </table>
          <div className="sub px-2 pt-2">漲跌都是相對買進當天收盤。只是描述，不是買賣訊號。</div>
        </div>
      </div>
    </div>
  );
}

// ---------------- 排序 ----------------
type RkRow = { c: string; n: string; pctile: number; conc: number; sellers: { n: string; cls: string; pct: number }[]; tags: string[] };
function RankTab({ onStock }: { onStock: (c: string) => void }) {
  const { data: scan } = useScan(0);
  const g = useGroups();
  const [list, setList] = useState("b-0050");
  const [paste, setPaste] = useState("");
  const codes = useMemo(() => {
    if (list === "paste") return [...new Set(paste.match(/\b\d{4}\b/g) ?? [])];
    if (!scan) return [];
    if (list === "b-0050") return top50(scan.rows).map((r) => r.c);
    if (list === "b-ath") return athRows(scan.rows).map((r) => r.c);
    if (list === "b-d20") return d20Rows(scan.rows).map((r) => r.c);
    return g.groups.find((x) => x.id === list)?.codes ?? [];
  }, [list, paste, scan, g.groups]);
  const { data } = usePoll<{ error?: string; date: string; rows: RkRow[]; skip: RkRow[]; none: string[] }>(codes.length ? `/api/brokers?view=rank&codes=${codes.join(",")}` : null);
  const LISTS: [string, string][] = [["b-0050", "0050 權值股"], ["b-ath", "創歷史新高"], ["b-d20", "近20日漲超20%"], ...g.groups.map((x): [string, string] => [x.id, x.name]), ["paste", "貼上代號"]];
  const row = (r: RkRow, i: number | null) => (
    <tr key={r.c} className="click" onClick={() => onStock(r.c)}>
      <td className="sub">{i == null ? "—" : i + 1}</td>
      <td style={{ textAlign: "left" }}>{r.n} <span className="mono sub">{r.c}</span></td>
      <td>{i == null ? <span className="sub">不排序</span> : <div className="flex items-center gap-2 justify-end"><div className="w-24 h-1.5 rounded bg-panel-2"><div className="h-full rounded bg-[var(--gold)]" style={{ width: `${r.pctile}%` }} /></div><span className="mono w-6">{r.pctile}</span></div>}</td>
      <td style={{ textAlign: "left", whiteSpace: "normal" }}>{r.sellers.map((x) => <span key={x.n} className="mr-3 inline-block">{x.n}<span className="mono down ml-1">{x.pct.toFixed(1)}%</span></span>)}</td>
      <td className="mono">{r.conc.toFixed(1)}%</td>
      <td>{r.tags.map((t) => <span key={t} className="chip ml-1 !bg-panel-2 !text-text-2">{t}</span>)}</td>
    </tr>
  );
  return (
    <div className="card">
      <div className="card-h" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <span>收盤後的排序<Help>在你的清單裡，依「賣方集中度百分位」排先後：前五大賣家合計佔當天成交量，扣掉規模、漲跌、波動、位置、量能等 11 個價量因素後，在全市場同一天的百分位（越高＝賣方越集中，常是大戶在出）。短線漲多（近 5 日漲 10% 以上或近 20 日漲 25% 以上）的不排序；高波動（近 20 日波動在全市場前 25%）只提醒。只幫你排先後，不是買進建議。</Help></span>
        <div className="seg flex-wrap">{LISTS.map(([id, l]) => <button key={id} className={list === id ? "on" : ""} onClick={() => setList(id)}>{l}</button>)}</div>
        {data && !data.error && <span className="sub">{md(data.date)} · 排了 {data.rows.length} 檔 · {data.skip.length} 檔不排{data.none.length ? ` · ${data.none.length} 檔沒有分點資料` : ""}</span>}
      </div>
      {list === "paste" && <div className="px-4 pb-3"><textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="貼上股票代號，空白、逗號或換行分隔，例如：2330 2317 2454" className="w-full h-20 bg-panel-2 border border-line rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--gold)]" /></div>}
      {!codes.length ? <div className="sub py-10 text-center">{list === "paste" ? "貼上代號後就會排序" : scan ? "這個清單是空的" : "清單載入中…"}</div> : !data ? <div className="sub py-10 text-center loading">排序中…</div> : data.error ? <div className="sub py-10 text-center">{data.error}</div> : (
        <div className="scroll-x px-2 pb-3">
          <table className="tbl text-[13px]">
            <thead><tr><th>名次</th><th style={{ textAlign: "left" }}>股票</th><th>賣方集中度百分位</th><th style={{ textAlign: "left" }}>前五大賣家（佔成交量）</th><th>合計</th><th>提醒</th></tr></thead>
            <tbody>{data.rows.map((r, i) => row(r, i))}{data.skip.map((r) => row(r, null))}</tbody>
          </table>
          {data.none.length > 0 && <div className="sub px-2 pt-2">沒有分點資料（成交值太小或不是股票）：{data.none.join("、")}</div>}
        </div>
      )}
    </div>
  );
}
