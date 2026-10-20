"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries, LineStyle, CrosshairMode,
  type IChartApi, type ISeriesApi, type IPriceLine, type UTCTimestamp, type MouseEventParams,
} from "lightweight-charts";
import { usePoll } from "./hooks";
import { price as fp, num } from "./fmt";
import { superLevels } from "@/lib/levels";
import type { Bar, Level } from "@/lib/types";

type TF = "1m" | "5m" | "1d" | "1wk" | "1mo";
const TF_LABEL: Record<TF, string> = { "1m": "分時", "5m": "分 K", "1d": "日 K", "1wk": "週 K", "1mo": "月 K" };
const RANGES = [{ k: 66, l: "3 個月" }, { k: 130, l: "6 個月" }, { k: 250, l: "1 年" }, { k: 500, l: "2 年" }];
const MA = [{ n: 5, c: "#e0b341" }, { n: 20, c: "#5aa9ff" }, { n: 60, c: "#b48cff" }];
const UP = "#f0505a", DOWN = "#22b573";
const SR_COLOR = { support: "#5aa9ff", resistance: "#f2994a" };

function ma(bars: Bar[], n: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let s = 0;
  bars.forEach((b, i) => {
    s += b.close;
    if (i >= n) s -= bars[i - n].close;
    if (i >= n - 1) out.push({ time: b.time as UTCTimestamp, value: s / n });
  });
  return out;
}

export default function KChart({
  code, height = 420, tfs = ["1m", "5m", "1d", "1wk", "1mo"], defaultTf = "1d", showVolume = true, compact = false, prev,
}: { code: string; height?: number; tfs?: TF[]; defaultTf?: TF; showVolume?: boolean; compact?: boolean; prev?: number }) {
  const [tf, setTf] = useState<TF>(defaultTf);
  const [range, setRange] = useState(130);
  const [line, setLine] = useState(false);
  const [sr, setSr] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const mainSeries = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null);

  const { data, error } = usePoll<{ bars: Bar[] }>(`/api/candles?code=${encodeURIComponent(code)}&tf=${tf}`, tf === "1m" || tf === "5m" ? 30_000 : 60_000);
  const intraday = tf === "1m" || tf === "5m";
  // 分時/分K：時間加 8 小時，讓圖上顯示台灣時間
  const bars = useMemo(() => (data?.bars ?? []).map((b) => (intraday ? { ...b, time: b.time + 8 * 3600 } : b)), [data, intraday]);
  const hasVol = showVolume && bars.some((b) => b.volume > 0);
  const levels = useMemo(() => (sr && tf !== "1m" ? superLevels(bars, fp) : null), [sr, tf, bars]);

  // 建立圖表
  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      height,
      layout: { background: { color: "transparent" }, textColor: "#9aa0a8", fontSize: 11, attributionLogo: false, panes: { separatorColor: "#262a31" } },
      grid: { vertLines: { color: "#1b1e23" }, horzLines: { color: "#1b1e23" } },
      rightPriceScale: { borderColor: "#262a31" },
      timeScale: { borderColor: "#262a31", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    chart.current = c;
    return () => { c.remove(); chart.current = null; mainSeries.current = null; priceLines.current = []; };
  }, [height]);

  // 畫資料
  useEffect(() => {
    const c = chart.current;
    if (!c || !bars.length) return;
    // 清掉舊的 series
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
    } else {
      const s = c.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceLineVisible: false });
      s.setData(data);
      mainSeries.current = s;
      if (!intraday || tf === "5m") for (const m of MA) {
        const l = c.addSeries(LineSeries, { color: m.c, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        l.setData(ma(bars, m.n));
      }
    }
    if (hasVol) {
      const v = c.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, 1);
      v.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? UP + "99" : DOWN + "99" })));
      const panes = c.panes();
      if (panes[1]) panes[1].setStretchFactor(0.25);
    }
    const ts = c.timeScale();
    if (intraday) ts.fitContent();
    else ts.setVisibleLogicalRange({ from: Math.max(0, bars.length - range), to: bars.length + 3 });
  }, [bars, line, tf, range, hasVol, intraday, prev]);

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
  }, [levels, bars, line]);

  // 十字線移動時顯示 OHLC
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const f = (p: MouseEventParams) => setHover(p.logical == null ? null : Math.round(p.logical));
    c.subscribeCrosshairMove(f);
    return () => c.unsubscribeCrosshairMove(f);
  }, []);

  const i = hover != null && hover >= 0 && hover < bars.length ? hover : bars.length - 1;
  const b = bars[i];
  const maVals = MA.map((m) => (i >= m.n - 1 ? bars.slice(i - m.n + 1, i + 1).reduce((s, x) => s + x.close, 0) / m.n : null));
  const dateLabel = b ? new Date(b.time * 1000).toISOString().slice(0, intraday ? 16 : 10).replace("T", " ") : "";

  return (
    <div className="relative">
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "px-3 pt-2" : "px-4 pt-3"}`}>
        {tfs.length > 1 && <div className="seg">
          {tfs.map((t) => <button key={t} className={tf === t ? "on" : ""} onClick={() => setTf(t)}>{TF_LABEL[t]}</button>)}
        </div>}
        {!intraday && !compact && (
          <div className="seg">
            {RANGES.map((r) => <button key={r.k} className={range === r.k ? "on" : ""} onClick={() => setRange(r.k)}>{r.l}</button>)}
          </div>
        )}
        <div className="flex-1" />
        {tf !== "1m" && <button className={`btn ${line ? "on" : ""}`} onClick={() => setLine(!line)}>折線</button>}
        {tf !== "1m" && (
          <button className={`btn ${sr ? "on" : ""}`} onClick={() => setSr(!sr)} title="依這個週期的 K 線標出支撐與壓力價位">
            <Spark /> 超級支撐壓力
          </button>
        )}
      </div>
      {b && (
        <div className="px-4 pt-2 text-[12px] mono flex flex-wrap gap-x-3 text-text-2">
          <span>{dateLabel}</span>
          {tf !== "1m" && <>
            <span>開 <span className="text-text">{fp(b.open)}</span></span>
            <span>高 <span className="up">{fp(b.high)}</span></span>
            <span>低 <span className="down">{fp(b.low)}</span></span>
          </>}
          <span>收 <span className="text-text">{fp(b.close)}</span></span>
          {b.volume > 0 && <span>量 <span className="text-text">{num(b.volume)}</span></span>}
          {!line && tf !== "1m" && MA.map((m, k) => maVals[k] != null && <span key={m.n} style={{ color: m.c }}>MA{m.n} {fp(maVals[k]!)}</span>)}
        </div>
      )}
      <div ref={box} style={{ height }} className="w-full" />
      {!bars.length && <div className="absolute inset-0 flex items-center justify-center text-text-2 pointer-events-none">{error ? `資料暫時無法取得：${error}` : <span className="loading">K 線載入中…</span>}</div>}
      {levels && <SRPanel levels={levels.levels} summary={levels.summary} tf={TF_LABEL[tf]} onClose={() => setSr(false)} />}
    </div>
  );
}

function Spark() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3 6h14M3 14h14" strokeDasharray="2 2" />
      <path d="M4 16l4-5 3 2 5-7" />
    </svg>
  );
}

function SRPanel({ levels, summary, tf, onClose }: { levels: Level[]; summary: string; tf: string; onClose: () => void }) {
  return (
    <div className="absolute left-4 top-24 z-10 w-[260px] max-w-[calc(100%-2rem)] rounded-xl border border-line bg-[#101215]/95 backdrop-blur p-3 shadow-xl">
      <div className="flex items-center gap-2 font-semibold text-[13px] text-[var(--gold-2)]"><Spark /> 超級支撐壓力 <span className="sub">依{tf}</span>
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
