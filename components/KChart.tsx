"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries, LineStyle, CrosshairMode,
  type IChartApi, type ISeriesApi, type SeriesType, type IPriceLine, type UTCTimestamp, type MouseEventParams, type Logical,
} from "lightweight-charts";
import { usePoll } from "./hooks";
import { price as fp, num, cls } from "./fmt";
import { superLevels } from "@/lib/levels";
import { IND, DEFAULT_INDS, type IndSetting, type Line } from "@/lib/indicators";
import DrawLayer, { TOOLS, type Tool } from "./chart/DrawLayer";
import IndicatorMenu from "./chart/IndicatorMenu";
import type { Bar, Level } from "@/lib/types";

type TF = "1m" | "mk" | "1d" | "1wk" | "1mo";
type MK = "1m" | "5m" | "15m" | "30m" | "60m";
const TF_LABEL: Record<TF, string> = { "1m": "分時", mk: "分 K", "1d": "日 K", "1wk": "週 K", "1mo": "月 K" };
const MK_LABEL: Record<MK, string> = { "1m": "1 分", "5m": "5 分", "15m": "15 分", "30m": "30 分", "60m": "60 分" };
const RANGES = [{ k: 66, l: "3 個月" }, { k: 130, l: "6 個月" }, { k: 250, l: "1 年" }, { k: 500, l: "2 年" }];
const UP = "#f0505a", DOWN = "#22b573";
const SR_COLOR = { support: "#5aa9ff", resistance: "#f2994a" };
const IND_KEY = "namba.inds";

function loadInds(): IndSetting[] {
  try { const v = JSON.parse(localStorage.getItem(IND_KEY) ?? "null"); if (Array.isArray(v) && v.every((x) => IND[x.id])) return v; } catch { /* */ }
  return DEFAULT_INDS;
}

/** 舊的呼叫方式：tfs 裡的 "5m" 代表分 K */
type InTF = "1m" | "5m" | "1d" | "1wk" | "1mo";
const toTF = (t: InTF): TF => (t === "5m" ? "mk" : t);

export default function KChart({
  code, height = 420, tfs = ["1m", "5m", "1d", "1wk", "1mo"], defaultTf = "1d", showVolume = true, compact = false, prev, title,
}: { code: string; height?: number; tfs?: InTF[]; defaultTf?: InTF; showVolume?: boolean; compact?: boolean; prev?: number; title?: string }) {
  const router = useRouter();
  const [tf, setTf] = useState<TF>(toTF(defaultTf));
  const [mk, setMk] = useState<MK>("5m");
  const [range, setRange] = useState(130);
  const [line, setLine] = useState(false);
  const [sr, setSr] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [inds, setIndsState] = useState<IndSetting[]>(DEFAULT_INDS);
  const [menu, setMenu] = useState(false);
  const [full, setFull] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [magnet, setMagnet] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [locked, setLocked] = useState(false);
  const [clearSig, setClearSig] = useState(0); // 清除畫線後重新掛載畫線層
  const [drawCount, setDrawCount] = useState(0);
  const [paneTops, setPaneTops] = useState<number[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const mainSeries = useRef<ISeriesApi<SeriesType> | null>(null);
  const [mainApi, setMainApi] = useState<ISeriesApi<SeriesType> | null>(null);

  // 指標設定存在瀏覽器；伺服器端沒有 localStorage，所以掛載後才讀
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!compact) setIndsState(loadInds()); }, [compact]);
  const setInds = (v: IndSetting[]) => { setIndsState(v); try { localStorage.setItem(IND_KEY, JSON.stringify(v)); } catch { /* */ } };

  const apiTf = tf === "mk" ? mk : tf;
  const intraday = tf === "1m" || tf === "mk";
  const { data, error } = usePoll<{ bars: Bar[] }>(`/api/candles?code=${encodeURIComponent(code)}&tf=${apiTf}`, intraday ? 30_000 : 60_000);
  // 分時/分K：時間加 8 小時，讓圖上顯示台灣時間
  const bars = useMemo(() => (data?.bars ?? []).map((b) => (intraday ? { ...b, time: b.time + 8 * 3600 } : b)), [data, intraday]);
  const hasVol = showVolume && bars.some((b) => b.volume > 0);
  const levels = useMemo(() => (sr && tf !== "1m" ? superLevels(bars, fp) : null), [sr, tf, bars]);
  const [extraSubs, setExtraSubs] = useState(0); // 副圖超過一個時，每多一個加高 90px
  const fullH = full && typeof window !== "undefined" ? window.innerHeight - 110 : height + extraSubs * 90;

  // 要畫的指標：分時只畫均價線；compact 只畫均線
  const active = useMemo(() => {
    if (tf === "1m") return [] as IndSetting[];
    const list = compact ? DEFAULT_INDS : inds;
    return list.filter((x) => x.id !== "vol" || hasVol);
  }, [tf, compact, inds, hasVol]);
  const computed = useMemo(() => active.map((s) => ({ s, ind: IND[s.id], lines: IND[s.id].calc(bars, s.params) as Line[] })), [active, bars]);
  const subs = useMemo(() => computed.filter((x) => !x.ind.overlay), [computed]);
  const want = Math.max(0, subs.length - 1);
  if (!compact && want !== extraSubs) setExtraSubs(want);

  // 建立圖表
  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      height: fullH,
      layout: { background: { color: "#131519" }, textColor: "#9aa0a8", fontSize: 11, attributionLogo: false, panes: { separatorColor: "#262a31" } },
      grid: { vertLines: { color: "#1b1e23" }, horzLines: { color: "#1b1e23" } },
      rightPriceScale: { borderColor: "#262a31" },
      timeScale: { borderColor: "#262a31", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    chart.current = c;
    setChartApi(c);
    return () => { c.remove(); chart.current = null; mainSeries.current = null; priceLines.current = []; setChartApi(null); setMainApi(null); };
  }, [fullH]);

  // 畫資料
  useEffect(() => {
    const c = chart.current;
    if (!c || !bars.length) return;
    for (const p of c.panes().slice().reverse()) for (const s of p.getSeries()) c.removeSeries(s);
    priceLines.current = [];
    const asLine = line || tf === "1m";
    const data = bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close }));
    if (asLine) {
      // 分時跟昨收比，其他週期跟第一根比
      const base = tf === "1m" && prev ? prev : bars[0].open, last = bars[bars.length - 1].close;
      const col = last >= base ? UP : DOWN;
      const s = c.addSeries(AreaSeries, { lineColor: col, topColor: col + "40", bottomColor: col + "05", lineWidth: 2, priceLineVisible: false });
      s.setData(data.map((d) => ({ time: d.time, value: d.close })));
      if (tf === "1m" && prev) s.createPriceLine({ price: prev, color: "#646a73", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "昨收" });
      mainSeries.current = s;
      if (tf === "1m" && hasVol) {
        // 分鐘均價（累計成交金額 ÷ 累計量）
        let pv = 0, v = 0;
        const avg = bars.map((b) => { pv += b.close * b.volume; v += b.volume; return { time: b.time as UTCTimestamp, value: v ? pv / v : b.close }; });
        c.addSeries(LineSeries, { color: "#e0b341", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(avg);
      }
    } else {
      const s = c.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceLineVisible: false });
      s.setData(data);
      mainSeries.current = s;
    }
    setMainApi(mainSeries.current);

    const addLines = (lines: Line[], pane: number, levelsAt?: number[]) => {
      let first: ISeriesApi<SeriesType> | null = null;
      for (const l of lines) {
        const pts = l.data.map((v, i) => ({ i, time: bars[i].time as UTCTimestamp, v })).filter((x) => x.v != null && Number.isFinite(x.v));
        if (l.type === "hist") {
          const isVol = l.name === "量";
          const s = c.addSeries(HistogramSeries, { priceFormat: isVol ? { type: "volume" } : { type: "price", precision: 2, minMove: 0.01 }, priceLineVisible: false, lastValueVisible: false }, pane);
          s.setData(pts.map((x) => ({
            time: x.time, value: x.v!,
            color: isVol ? (bars[x.i].close >= bars[x.i].open ? UP : DOWN) + "99" : (x.v! >= 0 ? UP : DOWN) + "bb",
          })));
          first ??= s;
        } else {
          const s = c.addSeries(LineSeries, {
            color: l.color, lineWidth: 1, lineStyle: l.dash ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
            ...(l.type === "dots" ? { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 2 } : {}),
          }, pane);
          s.setData(pts.map((x) => ({ time: x.time, value: x.v! })));
          first ??= s;
        }
      }
      if (first && levelsAt) for (const v of levelsAt) first.createPriceLine({ price: v, color: "#646a73", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false });
    };
    for (const x of computed.filter((y) => y.ind.overlay)) addLines(x.lines, 0);
    if (tf === "1m" && hasVol) addLines([{ name: "量", data: bars.map((b) => b.volume), color: "", type: "hist" }], 1);
    subs.forEach((x, k) => addLines(x.lines, k + 1, x.ind.levels));
    c.panes().forEach((p, k) => p.setStretchFactor(k > 0 ? 0.28 : 1));
    const ts = c.timeScale();
    if (tf === "1m") ts.fitContent();
    else ts.setVisibleLogicalRange({ from: Math.max(0, bars.length - (intraday ? 120 : range)), to: bars.length + 3 });
    // 副圖說明位置
    requestAnimationFrame(() => {
      const hs = c.panes().map((p) => p.getHeight());
      setPaneTops(hs.map((_, i) => hs.slice(0, i).reduce((a, b) => a + b, 0) + i));
    });
  }, [bars, line, tf, range, hasVol, intraday, prev, computed, subs]);

  // 支撐壓力線
  useEffect(() => {
    const s = mainSeries.current;
    if (!s) return;
    for (const p of priceLines.current) s.removePriceLine(p);
    priceLines.current = [];
    if (!levels) return;
    for (const l of levels.levels) {
      priceLines.current.push(s.createPriceLine({
        price: l.price, color: SR_COLOR[l.kind], lineWidth: l.strength === 3 ? 2 : 1,
        lineStyle: l.strength === 1 ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: true,
        title: `${l.kind === "support" ? "支撐" : "壓力"}${"●".repeat(l.strength)}`,
      }));
    }
  }, [levels, bars, line, computed]);

  // 十字線移動時顯示數值
  useEffect(() => {
    const c = chartApi;
    if (!c) return;
    const f = (p: MouseEventParams) => setHover(p.logical == null ? null : Math.round(p.logical));
    c.subscribeCrosshairMove(f);
    return () => c.unsubscribeCrosshairMove(f);
  }, [chartApi]);

  // 全螢幕
  useEffect(() => {
    const f = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen(); else wrap.current?.requestFullscreen?.(); };

  const zoom = (k: number) => {
    const ts = chart.current?.timeScale(); const r = ts?.getVisibleLogicalRange();
    if (!ts || !r) return;
    const w = (r.to - r.from) * k, to = r.to;
    ts.setVisibleLogicalRange({ from: (to - w) as Logical, to });
  };
  const saveImage = () => {
    const c = chart.current; if (!c) return;
    const a = document.createElement("a");
    a.href = c.takeScreenshot().toDataURL("image/png");
    a.download = `${title ?? code}-${TF_LABEL[tf].replace(/\s/g, "")}.png`;
    a.click();
  };

  const i = hover != null && hover >= 0 && hover < bars.length ? hover : bars.length - 1;
  const b = bars[i];
  // 開高低收的顏色跟前一根收盤比（台股：比前一根高是紅、低是綠）；分時跟昨收比
  const pc = tf === "1m" ? prev ?? bars[0]?.open ?? 0 : i > 0 ? bars[i - 1].close : b?.open ?? 0;
  const dateLabel = b ? new Date(b.time * 1000).toISOString().slice(0, intraday ? 16 : 10).replace("T", " ") : "";
  const val = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 1e5 ? num(v) : fp(v));
  const drawable = !compact && tf !== "1m";
  const drawKey = `namba.draw.${code}.${apiTf}`;
  const mainH = paneTops[1] ? paneTops[1] - 1 : fullH;

  return (
    <div ref={wrap} className={`relative ${full ? "bg-[var(--bg)] p-3" : ""}`}>
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "px-3 pt-2" : "px-4 pt-3"}`}>
        {tfs.length > 1 && <div className="seg">
          {tfs.map((t) => toTF(t)).map((t) => <button key={t} className={tf === t ? "on" : ""} onClick={() => setTf(t)}>{TF_LABEL[t]}</button>)}
        </div>}
        {tf === "mk" && <div className="seg">{(Object.keys(MK_LABEL) as MK[]).map((m) => <button key={m} className={mk === m ? "on" : ""} onClick={() => setMk(m)}>{MK_LABEL[m]}</button>)}</div>}
        {!intraday && !compact && (
          <div className="seg">
            {RANGES.map((r) => <button key={r.k} className={range === r.k ? "on" : ""} onClick={() => { setRange(r.k); chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - r.k), to: bars.length + 3 }); }}>{r.l}</button>)}
          </div>
        )}
        <div className="flex-1" />
        {!compact && <>
          <div className="flex items-center gap-1">
            <IconBtn title="縮小：看更長的區間" onClick={() => zoom(1.5)} d="M8 8m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M6 8h4M12 12l5 5" />
            <IconBtn title="放大：看更細的區間" onClick={() => zoom(0.66)} d="M8 8m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M6 8h4M8 6v4M12 12l5 5" />
            <IconBtn title="回到最新（在圖上點兩下也可以）" onClick={() => chart.current?.timeScale().scrollToRealTime()} d="M4 10h10M10 5l5 5-5 5M17 4v12" />
          </div>
          {tf !== "1m" && <>
            <IconBtn title="超級支撐壓力：依這個週期的 K 線標出支撐與壓力價位" on={sr} onClick={() => setSr(!sr)} d="M10 2l1.8 4.6L16.5 8l-4.7 1.4L10 14l-1.8-4.6L3.5 8l4.7-1.4zM16 13l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
            <IconBtn title="改成折線（收盤價連線）" on={line} onClick={() => setLine(!line)} d="M3 15l4-5 3 3 7-8" />
            <IconBtn title="技術指標：均線、通道、動能、量能、波動…共 74 個" on={menu} onClick={() => setMenu(!menu)} d="M3 16h14M4 13l3-4 3 2 3-5 3 3" />
          </>}
          <IconBtn title="把目前的圖存成圖片" onClick={saveImage} d="M10 3v10M6 9l4 4 4-4M4 16h12" />
          <IconBtn title="全螢幕" onClick={toggleFull} d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
        </>}
        {compact && tf !== "1m" && <button className={`btn ${line ? "on" : ""}`} onClick={() => setLine(!line)}>折線</button>}
      </div>
      {b && (
        <div className="px-4 pt-2 text-[12px] mono flex flex-wrap gap-x-3 text-text-2">
          <span>{dateLabel}</span>
          {tf !== "1m" && <>
            <span>開 <span className={cls(b.open - pc)}>{fp(b.open)}</span></span>
            <span>高 <span className={cls(b.high - pc)}>{fp(b.high)}</span></span>
            <span>低 <span className={cls(b.low - pc)}>{fp(b.low)}</span></span>
          </>}
          <span>收 <span className={cls(b.close - pc)}>{fp(b.close)}</span></span>
          {b.volume > 0 && <span>量 <span className="text-text">{num(b.volume)}</span></span>}
          {!line && computed.filter((x) => x.ind.overlay).flatMap((x) => x.lines.filter((l) => l.type !== "dots").map((l) => <span key={x.s.id + l.name} style={{ color: l.color }}>{l.name} {val(l.data[i])}</span>))}
        </div>
      )}
      <div className="relative flex">
        {drawable && (
          <div className="flex flex-col gap-0.5 px-1 pt-1 border-r border-line shrink-0">
            {TOOLS.map((t) => (
              <IconBtn key={t.k} title={t.title} on={tool === t.k} disabled={t.k === "pattern" && tf !== "1d"} onClick={() => setTool(tool === t.k ? "select" : t.k)} d={t.icon} small />
            ))}
            <div className="h-px bg-line my-1" />
            <IconBtn small title="磁吸：開啟後端點會吸到 K 棒的開高低收" on={magnet} onClick={() => setMagnet(!magnet)} d="M5 3v7a5 5 0 0 0 10 0V3M5 6h3M12 6h3" />
            <IconBtn small title="隱藏全部畫線：暫時收起畫線，不會刪除" on={hidden} onClick={() => setHidden(!hidden)} d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6zM3 3l14 14" />
            <IconBtn small title="鎖定畫線：鎖定後畫線不會被誤拖" on={locked} onClick={() => setLocked(!locked)} d="M5 9h10v8H5zM7 9V6a3 3 0 0 1 6 0v3" />
            <IconBtn small title={drawCount ? `清除全部畫線（${drawCount} 條）` : "清除全部畫線：目前沒有畫線"} disabled={!drawCount} onClick={() => { try { localStorage.removeItem(drawKey); } catch { /* */ } setClearSig(Date.now()); }} d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" />
          </div>
        )}
        <div className="relative flex-1 min-w-0">
          <div ref={box} style={{ height: fullH }} className="w-full" onDoubleClick={() => chart.current?.timeScale().scrollToRealTime()} />
          {drawable && (
            <DrawLayer chart={chartApi} series={mainApi} bars={bars} storageKey={drawKey} tool={tool} setTool={setTool} magnet={magnet} hidden={hidden} locked={locked}
              key={`${drawKey}:${clearSig}`} height={mainH} onCount={setDrawCount} fmt={fp}
              onPattern={(a, z) => router.push(`/pattern?code=${code}&from=${new Date(a * 1000).toISOString().slice(0, 10)}&to=${new Date(z * 1000).toISOString().slice(0, 10)}`)} />
          )}
          {/* 副圖說明 */}
          {subs.map((x, k) => paneTops[k + 1] != null && (
            <div key={x.s.id} className="absolute left-2 z-10 text-[11px] mono pointer-events-none flex gap-2 flex-wrap" style={{ top: paneTops[k + 1] + 2 }}>
              <span className="text-text-2">{x.ind.abbr}{x.s.params.length ? `(${x.s.params.join(", ")})` : ""}</span>
              {x.lines.map((l) => <span key={l.name} style={{ color: l.color || "#9aa0a8" }}>{l.name} {val(l.data[i])}</span>)}
            </div>
          ))}
          {!bars.length && <div className="absolute inset-0 flex items-center justify-center text-text-2 pointer-events-none">{error ? `資料暫時無法取得：${error}` : <span className="loading">K 線載入中…</span>}</div>}
        </div>
      </div>
      {menu && <IndicatorMenu value={inds} onChange={setInds} onClose={() => setMenu(false)} />}
      {levels && <SRPanel levels={levels.levels} summary={levels.summary} tf={TF_LABEL[tf]} onClose={() => setSr(false)} />}
    </div>
  );
}

function IconBtn({ title, onClick, d, on, disabled, small }: { title: string; onClick: () => void; d: string; on?: boolean; disabled?: boolean; small?: boolean }) {
  return (
    <button title={title} aria-label={title} disabled={disabled} onClick={onClick}
      className={`${small ? "w-7 h-7" : "w-8 h-8"} inline-flex items-center justify-center rounded-lg border ${on ? "border-[var(--gold)] text-[var(--gold-2)] bg-[#2a2416]" : "border-transparent text-text-2 hover:text-text hover:bg-panel-2"} ${disabled ? "opacity-30 pointer-events-none" : ""}`}>
      <svg width={small ? 15 : 16} height={small ? 15 : 16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
    </button>
  );
}

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3 6h14M3 14h14" strokeDasharray="2 2" />
      <path d="M4 16l4-5 3 2 5-7" />
    </svg>
  );
}

function SRPanel({ levels, summary, tf, onClose }: { levels: Level[]; summary: string; tf: string; onClose: () => void }) {
  return (
    <div className="absolute left-12 top-24 z-10 w-[260px] max-w-[calc(100%-4rem)] rounded-xl border border-line bg-[#101215]/95 backdrop-blur p-3 shadow-xl">
      <div className="flex items-center gap-2 font-semibold text-[13px] text-[var(--gold-2)]"><SparkIcon /> 超級支撐壓力 <span className="sub">依{tf}</span>
        <button onClick={onClose} className="ml-auto text-text-2 hover:text-text" aria-label="關閉">✕</button>
      </div>
      {levels.length === 0 && <div className="sub mt-2">這次沒有判讀出明確的價位。</div>}
      <div className="mt-2 flex flex-col gap-1">
        {levels.map((l) => (
          <div key={`${l.kind}${l.price}`} className="flex items-center gap-2 text-[12.5px]" title={l.note} style={{ ["--c" as string]: SR_COLOR[l.kind] }}>
            <span style={{ color: SR_COLOR[l.kind] }} className="w-8">{l.kind === "support" ? "支撐" : "壓力"}</span>
            <span className="mono w-16">{fp(l.price)}</span>
            <span className="dots" aria-label={`強度 ${l.strength}／3`}>{[1, 2, 3].map((k) => <i key={k} className={k <= l.strength ? "on" : ""} />)}</span>
            <span className="sub truncate flex-1">{l.note}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-text-2">{summary}</p>
    </div>
  );
}
