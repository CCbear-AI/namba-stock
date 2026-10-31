import { getMarket } from "@/lib/market";
import { misOhlc } from "@/lib/misStats";
import { UNIVERSE } from "@/lib/universe";
import { getDaily, lastIdx } from "@/lib/history";
import { getFlowDay } from "@/lib/store";
import { txf } from "@/lib/taifex";
import { international } from "@/lib/world";

// 大盤頁：台指期、買賣力道、權值股貢獻點數、國際行情
const r2 = (v: number) => Math.round(v * 100) / 100;

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
