// Yahoo Finance 歷史 K 線（個股、加權指數）
import type { Bar } from "./types";

export type TF = "1m" | "5m" | "15m" | "30m" | "60m" | "1d" | "1wk" | "1mo";
const RANGE: Record<TF, string> = { "1m": "1d", "5m": "1mo", "15m": "1mo", "30m": "1mo", "60m": "3mo", "1d": "2y", "1wk": "10y", "1mo": "max" };

export function yahooSymbol(code: string, m: "tse" | "otc") {
  if (code === "TAIEX") return "^TWII";
  return `${code}.${m === "otc" ? "TWO" : "TW"}`;
}

const cache = new Map<string, { at: number; bars: Bar[] }>();

/** range 可覆蓋預設抓多久（週／月 K 用長期日 K 自己組時要抓 10y / max） */
export async function yahooBars(symbol: string, tf: TF, range = RANGE[tf]): Promise<Bar[]> {
  const key = `${symbol}:${tf}:${range}`;
  const ttl = tf.endsWith("m") && tf !== "1mo" ? 30_000 : 10 * 60_000;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.bars;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${tf}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const j = await r.json();
  const res = j.chart?.result?.[0];
  if (!res?.timestamp) return [];
  const q = res.indicators.quote[0];
  const bars: Bar[] = [];
  res.timestamp.forEach((t: number, i: number) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || c == null) return;
    // 日線以上用當天 00:00 UTC 當時間，lightweight-charts 才不會錯位
    const time = tf === "1d" || tf === "1wk" || tf === "1mo" ? Math.floor((t + 8 * 3600) / 86400) * 86400 : t;
    // Yahoo 舊資料價格常是 80.21367645 這種長小數 → 四捨五入到小數 2 位
    const r2 = (x: number) => Math.round(x * 100) / 100;
    bars.push({ time, open: r2(o), high: r2(h ?? Math.max(o, c)), low: r2(l ?? Math.min(o, c)), close: r2(c), volume: Math.round((q.volume[i] ?? 0) / (symbol.startsWith("^") ? 1 : 1000)) });
  });
  // 同一時間重複的只留最後一根
  const dedup = bars.filter((b, i) => i === bars.length - 1 || bars[i + 1].time !== b.time);
  cache.set(key, { at: Date.now(), bars: dedup });
  return dedup;
}

/** 日 K 合成週 K / 月 K。每根的日期＝該週／該月最後一個交易日（跟 Yahoo 股市網頁一樣） */
export function resample(daily: Bar[], tf: "1wk" | "1mo"): Bar[] {
  const out: Bar[] = [];
  let lastKey = NaN;
  for (const b of daily) {
    const d = new Date(b.time * 1000);
    let key: number;
    if (tf === "1mo") key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
    else { const wd = (d.getUTCDay() + 6) % 7; key = b.time - wd * 86400; }
    const last = out[out.length - 1];
    if (last && lastKey === key) {
      last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low); last.close = b.close; last.volume += b.volume;
      last.time = b.time;
    } else { out.push({ ...b }); lastKey = key; }
  }
  return out;
}
