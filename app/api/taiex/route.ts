import { getMarket } from "@/lib/market";
import { misOhlc } from "@/lib/misStats";
import { UNIVERSE } from "@/lib/universe";
import { getDaily, lastIdx } from "@/lib/history";
import { getFlowDay } from "@/lib/store";
import { txf } from "@/lib/taifex";

// 大盤頁：台指期、買賣力道、權值股貢獻點數、國際行情
const r2 = (v: number) => Math.round(v * 100) / 100;

const INTL: { s: string; n: string; g: string }[] = [
  { s: "^SOX", n: "費城半導體", g: "美股" }, { s: "^IXIC", n: "那斯達克", g: "美股" }, { s: "^GSPC", n: "S&P 500", g: "美股" }, { s: "^DJI", n: "道瓊工業", g: "美股" },
  { s: "NQ=F", n: "那斯達克期貨", g: "美股期貨" }, { s: "ES=F", n: "S&P 500 期貨", g: "美股期貨" },
  { s: "^N225", n: "日經 225", g: "亞洲" }, { s: "^KS11", n: "韓國綜合", g: "亞洲" }, { s: "^HSI", n: "恆生指數", g: "亞洲" }, { s: "000001.SS", n: "上證指數", g: "亞洲" },
  { s: "TWD=X", n: "美元／台幣", g: "匯率與利率" }, { s: "^TNX", n: "美債 10 年", g: "匯率與利率" },
];
let intl: { at: number; v: unknown[] } | null = null;
async function international() {
  if (intl && Date.now() - intl.at < 2 * 60_000) return intl.v;
  const v = await Promise.all(INTL.map(async (x) => {
    try {
      // 用最近一個交易時段的 5 分 K：chartPreviousClose 才是「前一天收盤」（range=5d 會變成 5 天前，漲跌幅就錯了），順便畫小走勢
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(x.s)}?range=1d&interval=5m`, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
      const res = (await r.json()).chart.result[0];
      const meta = res.meta;
      const price = meta.regularMarketPrice, prev = meta.chartPreviousClose ?? meta.previousClose;
      const closes: number[] = (res.indicators?.quote?.[0]?.close ?? []).filter((v: number | null) => v != null);
      const step = Math.max(1, Math.ceil(closes.length / 60));
      const spark = closes.filter((_, i) => i % step === 0 || i === closes.length - 1).map((v) => Math.round(v * 1000) / 1000);
      return { ...x, price, prev, chg: r2(price - prev), pct: r2(((price - prev) / prev) * 100), spark };
    } catch { return { ...x, price: 0, prev: 0, chg: 0, pct: 0, spark: [] as number[] }; }
  }));
  intl = { at: Date.now(), v };
  return v;
}

export async function GET() {
  const [m, tse, otc, f, world, day] = await Promise.all([getMarket(), misOhlc("TSE"), misOhlc("OTC"), txf(), international(), getFlowDay().catch(() => null)]);
  const t00 = m.indices.find((q) => q.c === "t00");
  // 權值股貢獻點數（估算）：個股市值變動 ÷ 上市總市值 × 指數
  const tse0 = m.stocks.filter((s) => s.m === "tse");
  const sh = new Map(UNIVERSE.map((u) => [u.c, u.sh]));
  // 分母用全部上市股票的市值（這一輪沒抓到的用最近收盤補），避免股票少算時點數被放大
  const prevOf = new Map(tse0.map((s) => [s.c, s.prev]));
  const { s: hist } = getDaily();
  let totalCap = 0;
  for (const u of UNIVERSE) {
    if (u.m !== "tse") continue;
    let p = prevOf.get(u.c);
    if (p == null) { const x = hist.get(u.c); const i = x ? lastIdx(x.c) : -1; p = i >= 0 ? x!.c[i] : 0; }
    totalCap += u.sh * p;
  }
  const contrib = t00 && totalCap ? tse0.map((s) => ({ c: s.c, n: s.n, pct: s.pct, pt: r2((((sh.get(s.c) ?? 0) * (s.price - s.prev)) / totalCap) * t00.prev) })) : [];
  contrib.sort((a, b) => b.pt - a.pt);
  const today = new Date(m.time + 8 * 3600e3).toISOString().slice(0, 10);
  return Response.json({
    time: m.time,
    futures: f ? { ...(f as object), basis: t00 ? r2((f as { price: number }).price - t00.price) : 0 } : null,
    orders: { tse: tse.orders, otc: otc.orders },
    ordersLine: day?.date === today ? (day.orders ?? []) : [],
    contrib: { up: contrib.slice(0, 5), down: contrib.slice(-5).reverse(), upSum: r2(contrib.slice(0, 5).reduce((a, x) => a + Math.max(0, x.pt), 0)), downSum: r2(contrib.slice(-5).reduce((a, x) => a + Math.min(0, x.pt), 0)) },
    world,
  });
}
