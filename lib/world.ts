// 國際行情（Yahoo 延遲報價）：大盤頁國際行情卡、早上國際焦點（scripts/world-focus.ts）共用
const r2 = (v: number) => Math.round(v * 100) / 100;

export type WorldQ = { s: string; n: string; g: string; price: number; prev: number; chg: number; pct: number; spark: number[]; time: number };

export const INTL: { s: string; n: string; g: string }[] = [
  { s: "^SOX", n: "費城半導體", g: "美股" }, { s: "^IXIC", n: "那斯達克", g: "美股" }, { s: "^GSPC", n: "S&P 500", g: "美股" }, { s: "^DJI", n: "道瓊工業", g: "美股" },
  { s: "NQ=F", n: "那斯達克期貨", g: "美股期貨" }, { s: "ES=F", n: "S&P 500 期貨", g: "美股期貨" },
  { s: "^N225", n: "日經 225", g: "亞洲" }, { s: "^KS11", n: "韓國綜合", g: "亞洲" }, { s: "^HSI", n: "恆生指數", g: "亞洲" }, { s: "000001.SS", n: "上證指數", g: "亞洲" },
  { s: "TWD=X", n: "美元／台幣", g: "匯率與利率" }, { s: "^TNX", n: "美債 10 年", g: "匯率與利率" },
];

/** 一檔的最近一個交易時段：chartPreviousClose 才是「前一天收盤」（range=5d 會變成 5 天前，漲跌幅就錯了），順便畫小走勢 */
export async function worldQuote(x: { s: string; n: string; g: string }): Promise<WorldQ> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(x.s)}?range=1d&interval=5m`, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    const res = (await r.json()).chart.result[0];
    const meta = res.meta;
    const price = meta.regularMarketPrice, prev = meta.chartPreviousClose ?? meta.previousClose;
    const closes: number[] = (res.indicators?.quote?.[0]?.close ?? []).filter((v: number | null) => v != null);
    const step = Math.max(1, Math.ceil(closes.length / 60));
    const spark = closes.filter((_, i) => i % step === 0 || i === closes.length - 1).map((v) => Math.round(v * 1000) / 1000);
    return { ...x, price, prev, chg: r2(price - prev), pct: r2(((price - prev) / prev) * 100), spark, time: (meta.regularMarketTime ?? 0) * 1000 };
  } catch { return { ...x, price: 0, prev: 0, chg: 0, pct: 0, spark: [], time: 0 }; }
}

let intl: { at: number; v: WorldQ[] } | null = null;
export async function international() {
  if (intl && Date.now() - intl.at < 2 * 60_000) return intl.v;
  const v = await Promise.all(INTL.map(worldQuote));
  intl = { at: Date.now(), v };
  return v;
}
