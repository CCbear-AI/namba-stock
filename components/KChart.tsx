"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries, LineStyle, CrosshairMode, TickMarkType,
  type IChartApi, type ISeriesApi, type Time, type SeriesType, type IPriceLine, type UTCTimestamp, type MouseEventParams, type Logical,
} from "lightweight-charts";
import { usePoll } from "./hooks";
import { price as fp, num, cls } from "./fmt";
import { doublePatterns, type DoublePattern } from "@/lib/patterns";
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
const PAT_COLOR = "#e0c27a";
/** 支撐壓力依強度調深淺（色碼後面加透明度） */
const STRENGTH_ALPHA: Record<1 | 2 | 3, string> = { 1: "80", 2: "c0", 3: "ff" };
// 價格軸：千分位、小數位數依商品固定（指數 2 位；個股依升降單位 4,010／245.5／18.35），
// 位數固定，滑鼠移動時價格軸寬度才不會伸縮
function priceFmt(code: string, last: number) {
  const index = code === "TAIEX" || code === "OTC" || code.startsWith("sector:");
  const dec = index ? 2 : last >= 1000 ? 0 : last >= 50 ? 1 : 2;
  return { type: "custom" as const, minMove: 10 ** -dec, formatter: (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) };
}
const PAT_NAME = { M: "M 頭", W: "W 底" } as const;
type SrData = { levels: Level[]; summary: string; model: string; asOf: string; price: number; aiError?: string };
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
  const [hoverY, setHoverY] = useState<number | null>(null);
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
  // 超級支撐壓力：伺服器端 AI 判讀（同一根 K 線只判讀一次）；M 頭／W 底在瀏覽器直接算
  const srOn = sr && tf !== "1m";
  const lastT = data?.bars?.length ? data.bars[data.bars.length - 1].time : 0;
  const srKey = srOn && lastT ? `/api/levels?v=2&code=${encodeURIComponent(code)}&tf=${apiTf}&d=${intraday ? Math.floor(lastT / 1800) : lastT}` : null;
  const [sres, setSres] = useState<{ key: string; r?: SrData; err?: string } | null>(null);
  useEffect(() => {
    if (!srKey) return;
    let stop = false;
    fetch(srKey).then((r) => r.json()).then((j: SrData & { error?: string }) => {
      if (!stop) setSres(j.error ? { key: srKey, err: j.error } : { key: srKey, r: j });
    }).catch((e) => { if (!stop) setSres({ key: srKey, err: (e as Error).message }); });
    return () => { stop = true; };
  }, [srKey]);
  const srState = srKey && sres?.key === srKey ? sres : null;
  const levels = srState?.r ?? null;
  const patterns = useMemo(() => (srOn && bars.length >= 30 ? doublePatterns(bars).patterns : []), [srOn, bars]);
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
      grid: { vertLines: { visible: false }, horzLines: { visible: false } }, // 跟里長伯一樣不畫格線，畫面比較乾淨
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
      const s = c.addSeries(AreaSeries, { lineColor: col, topColor: col + "40", bottomColor: col + "05", lineWidth: 2, priceLineVisible: false, priceFormat: priceFmt(code, last) });
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
      // 現價：灰色細虛線橫貫整張圖
      const s = c.addSeries(CandlestickSeries, {
        upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
        priceLineVisible: true, priceLineStyle: LineStyle.Dashed, priceLineWidth: 1, priceLineColor: "#646a73", priceFormat: priceFmt(code, bars[bars.length - 1].close),
      });
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
    // 時間軸：日／週 K 顯示 月/日，月 K 顯示 年/月，分 K 顯示 時:分（時間已經是台灣時間）
    c.applyOptions({ timeScale: {
      tickMarkFormatter: (t: Time, type: TickMarkType) => {
        const d = new Date((t as number) * 1000), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
        if (type === TickMarkType.Year) return String(y);
        if (type === TickMarkType.Time || type === TickMarkType.TimeWithSeconds) return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        return tf === "1mo" ? `${y}/${m}` : `${m}/${day}`;
      },
    } });
    if (tf === "1m") ts.fitContent();
    else ts.setVisibleLogicalRange({ from: Math.max(0, bars.length - (intraday ? 120 : range)), to: bars.length + 3 });
    // 副圖說明位置
    requestAnimationFrame(() => {
      const hs = c.panes().map((p) => p.getHeight());
      setPaneTops(hs.map((_, i) => hs.slice(0, i).reduce((a, b) => a + b, 0) + i));
    });
  }, [bars, line, tf, range, hasVol, intraday, prev, computed, subs, code]);

  // 支撐壓力線：虛線，強度越高越粗越深；右邊價格軸保留價位標籤。
  // 型態（M 頭／W 底）不畫橫貫整張圖的線，只在價格軸標頸線／滿足價，形狀畫在下面的 SVG
  useEffect(() => {
    const s = mainSeries.current;
    if (!s) return;
    for (const p of priceLines.current) s.removePriceLine(p);
    priceLines.current = [];
    for (const l of levels?.levels ?? []) {
      priceLines.current.push(s.createPriceLine({
        price: l.price, color: SR_COLOR[l.kind] + STRENGTH_ALPHA[l.strength], lineWidth: l.strength === 3 ? 2 : 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "",
      }));
    }
    for (const p of patterns) {
      priceLines.current.push(s.createPriceLine({ price: p.neck, color: PAT_COLOR, lineVisible: false, axisLabelVisible: true, title: "" }));
      if (p.broke >= 0) priceLines.current.push(s.createPriceLine({ price: p.target, color: PAT_COLOR, lineVisible: false, axisLabelVisible: true, title: "" }));
    }
  }, [levels, patterns, bars, line, computed]);

  // 左側文字：離現價最近的上下各 2 個一直顯示，其他滑鼠移到線（區間）附近才出現
  const srTexts = useMemo(() => {
    const ls = levels?.levels ?? [];
    const near = new Set([
      ...ls.filter((l) => l.kind === "resistance").sort((a, b) => a.price - b.price).slice(0, 2),
      ...ls.filter((l) => l.kind === "support").sort((a, b) => b.price - a.price).slice(0, 2),
    ].map((l) => l.price));
    return ls.map((l) => ({ l, primary: near.has(l.price), color: SR_COLOR[l.kind] + STRENGTH_ALPHA[l.strength], text: `${l.kind === "support" ? "支撐" : "壓力"} ${fp(l.price)}${l.note ? ` · ${l.note}` : ""}` }));
  }, [levels]);

  // 每一格畫面重算座標（拖曳、縮放、改變價格軸都會跟著動），有變才更新畫面
  type Geo = {
    w: number;
    lv: { y: number | null; z?: [number, number] }[];
    pat: { pts: [number, number][]; neck: [number, number, number]; tgt: [number, number, number] | null }[];
  };
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => {
    if (!srTexts.length && !patterns.length) return;
    let raf = 0, prevKey = "";
    const tick = () => {
      const s = mainSeries.current, c = chart.current;
      if (s && c && bars.length) {
        const ts = c.timeScale();
        const y = (p: number) => { const v = s.priceToCoordinate(p); return v == null ? null : Math.round(v); };
        const x = (i: number) => { const v = ts.timeToCoordinate(bars[Math.min(i, bars.length - 1)].time as UTCTimestamp); return v == null ? null : Math.round(v); };
        const w = Math.round(ts.width());
        const g: Geo = {
          w,
          lv: srTexts.map(({ l }) => {
            const z = l.zone ? [y(l.zone[0]), y(l.zone[1])] : null;
            return { y: y(l.price), ...(z && z[0] != null && z[1] != null ? { z: [Math.min(z[0], z[1]), Math.max(z[0], z[1])] as [number, number] } : {}) };
          }),
          pat: patterns.flatMap((p) => {
            const xa = x(p.a.i), xm = x(p.mid.i), xb = x(p.b.i), ya = y(p.a.price), ym = y(p.mid.price), yb = y(p.b.price), yn = y(p.neck);
            if (xa == null || xm == null || xb == null || ya == null || ym == null || yb == null || yn == null) return [];
            const end = p.broke >= 0 ? x(p.broke) ?? w : w;
            const yt = p.broke >= 0 ? y(p.target) : null;
            return [{ pts: [[xa, ya], [xm, ym], [xb, yb]] as [number, number][], neck: [xa, end, yn] as [number, number, number], tgt: yt != null && p.broke >= 0 ? [x(p.broke) ?? w, w, yt] as [number, number, number] : null }];
          }),
        };
        const key = JSON.stringify(g);
        if (key !== prevKey) { prevKey = key; setGeo(g); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [srTexts, patterns, bars]);

  // 要顯示的文字與位置：線太近時往上錯開（由下往上排）
  const srLabels = useMemo(() => {
    if (!geo) return [];
    const show = srTexts.map((t, k) => {
      const g = geo.lv[k];
      if (!g || g.y == null) return null;
      const hit = hoverY != null && (Math.abs(hoverY - g.y) <= 8 || (g.z && hoverY >= g.z[0] - 4 && hoverY <= g.z[1] + 4));
      return t.primary || hit ? { k, y: g.z ? g.z[0] : g.y } : null;
    }).filter((v): v is { k: number; y: number } => !!v).sort((a, b) => b.y - a.y);
    let floor = Infinity;
    return show.map(({ k, y }) => { const top = Math.min(y - 16, floor - 14); floor = top; return { k, top }; });
  }, [geo, srTexts, hoverY]);

  // 十字線移動時顯示數值
  useEffect(() => {
    const c = chartApi;
    if (!c) return;
    const f = (p: MouseEventParams) => { setHover(p.logical == null ? null : Math.round(p.logical)); setHoverY(p.point ? Math.round(p.point.y) : null); };
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
        <div className="px-4 pt-2 text-[12px] mono flex flex-nowrap whitespace-nowrap scroll-x gap-x-3 text-text-2">
          {/* 固定單行：滑鼠移到不同 K 線時數字長短會變，換行會把整張圖往下推（看起來在跳），太長就左右滑 */}
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
      {srOn && <SRPanel data={levels} err={srState?.err} patterns={patterns} tf={TF_LABEL[tf]} onClose={() => setSr(false)} />}
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
          {/* 超級支撐壓力：區間畫半透明色帶、M 頭／W 底畫出形狀，文字放線的左上方（跟線同色、不塗底） */}
          {geo && (srTexts.length > 0 || patterns.length > 0) && (
            <svg className="absolute left-0 top-0 z-[5] pointer-events-none" width={geo.w} height={mainH} aria-hidden="true">
              {srTexts.map((t, k) => {
                const z = geo.lv[k]?.z;
                return z ? <rect key={k} x={0} y={z[0]} width={geo.w} height={Math.max(2, z[1] - z[0])} fill={SR_COLOR[t.l.kind]} opacity={0.1 + 0.05 * t.l.strength} /> : null;
              })}
              {geo.pat.map((g, k) => {
                const p = patterns[k];
                if (!p) return null;
                const top = p.kind === "M";
                const mx = (g.pts[0][0] + g.pts[2][0]) / 2, my = top ? Math.min(g.pts[0][1], g.pts[2][1]) - 10 : Math.max(g.pts[0][1], g.pts[2][1]) + 18;
                return (
                  <g key={p.kind} fill="none" stroke={PAT_COLOR}>
                    <polyline points={g.pts.map((q) => q.join(",")).join(" ")} strokeWidth={1.5} opacity={0.85} />
                    {[g.pts[0], g.pts[2]].map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={3} fill={PAT_COLOR} stroke="none" />)}
                    <line x1={g.neck[0]} x2={g.neck[1]} y1={g.neck[2]} y2={g.neck[2]} strokeWidth={1} strokeDasharray="5 4" />
                    <text x={mx} y={my} fill={PAT_COLOR} stroke="none" fontSize={11.5} textAnchor="middle">{PAT_NAME[p.kind]}</text>
                    <text x={g.neck[1] - 4} y={g.neck[2] + (top ? 14 : -5)} fill={PAT_COLOR} stroke="none" fontSize={11} textAnchor="end">頸線 {fp(p.neck)}</text>
                    {g.tgt && g.tgt[2] > 8 && g.tgt[2] < mainH - 4 && <>
                      <line x1={g.tgt[0]} x2={g.tgt[1]} y1={g.tgt[2]} y2={g.tgt[2]} strokeWidth={1} strokeDasharray="2 3" />
                      <text x={g.tgt[1] - 4} y={g.tgt[2] - 5} fill={PAT_COLOR} stroke="none" fontSize={11} textAnchor="end">滿足 {fp(p.target)}</text>
                    </>}
                  </g>
                );
              })}
            </svg>
          )}
          {srLabels.map(({ k, top }) => top > 0 && top < mainH - 12 && (
            <div key={k} className="absolute left-2 z-10 text-[11.5px] pointer-events-none whitespace-nowrap max-w-[70%] truncate"
              style={{ top, color: srTexts[k].color, textShadow: "0 0 3px #0b0d11, 0 0 3px #0b0d11" }}>{srTexts[k].text}</div>
          ))}
          {!bars.length && <div className="absolute inset-0 flex items-center justify-center text-text-2 pointer-events-none">{error ? `資料暫時無法取得：${error}` : <span className="loading">K 線載入中…</span>}</div>}
        </div>
      </div>
      {menu && <IndicatorMenu value={inds} onChange={setInds} onClose={() => setMenu(false)} />}
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

function SRPanel({ data, err, patterns, tf, onClose }: { data: SrData | null; err?: string; patterns: DoublePattern[]; tf: string; onClose: () => void }) {
  const levels = data?.levels ?? [];
  const chip = "inline-flex items-center gap-1.5 rounded-md border border-line bg-[#0f1216] px-2 py-0.5 text-[12.5px]";
  return (
    <div className="mx-3 mt-2 rounded-xl border border-line bg-[#101215] px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[13px] text-[var(--gold-2)] mr-1"><SparkIcon /> 超級支撐壓力 <span className="sub font-normal">依{tf}</span></span>
        {patterns.map((p) => (
          <span key={p.kind} className={chip}
            title={`${PAT_NAME[p.kind]}：兩個${p.kind === "M" ? "高點" : "低點"} ${fp(p.a.price)}／${fp(p.b.price)}，頸線 ${fp(p.neck)}；滿足點約 ${fp(p.target)}（依型態等幅推算，僅供參考）`}>
            <span style={{ color: p.kind === "M" ? DOWN : UP }}>{PAT_NAME[p.kind]}</span>
            <span style={{ color: PAT_COLOR }}>頸線</span><span className="mono">{fp(p.neck)}</span>
            <span className="sub">{p.broke >= 0 ? (p.kind === "M" ? "已跌破" : "已突破") : (p.kind === "M" ? "未跌破" : "未突破")}</span>
            {p.broke >= 0 && <><span className="sub">滿足</span><span className="mono">{fp(p.target)}</span></>}
          </span>
        ))}
        {levels.map((l) => (
          <span key={`${l.kind}${l.price}`} className={chip} title={l.note}>
            <span style={{ color: SR_COLOR[l.kind] }}>{l.kind === "support" ? "支撐" : "壓力"}</span>
            <span className="mono">{fp(l.price)}</span>
            <span className="dots" aria-label={`強度 ${l.strength}／3`}>{[1, 2, 3].map((k) => <i key={k} className={k <= l.strength ? "on" : ""} />)}</span>
          </span>
        ))}
        <button onClick={onClose} className="ml-auto text-text-2 hover:text-text" aria-label="關閉">✕</button>
      </div>
      {!data && !err && <div className="sub mt-1.5 loading">正在判讀{tf}的支撐與壓力，通常要十幾秒…</div>}
      {err && <div className="sub mt-1.5">判讀失敗：{err}</div>}
      {data && levels.length === 0 && <div className="sub mt-1.5">這次沒有判讀出明確的價位。</div>}
      {data?.summary && <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-2">{data.summary}</p>}
      {data?.model === "formula" && <p className="mt-1 text-[11px] text-text-2 opacity-70">AI 暫時無法使用（{data.aiError}），先顯示程式計算版。</p>}
    </div>
  );
}
