import { getQuotes, ch } from "@/lib/mis";
import { BY_CODE } from "@/lib/universe";
import { toRow, getMarket } from "@/lib/market";
import { getFlowDay } from "@/lib/store";

// 個股即時報價（含五檔）。?code=2330
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const s = BY_CODE.get(code);
  // 不在清單內（例如 ETF）就上市、上櫃都查
  const chs = s ? [ch(s.m, code)] : [ch("tse", code), ch("otc", code)];
  const qs = await getQuotes(chs);
  const q = qs.find((x) => x.price > 0) ?? qs[0];
  if (!q) {
    // 即時報價抓不到：用全市場快照（可能是收盤資料）撐著，五檔留空
    const r = (await getMarket().catch(() => null))?.stocks.find((x) => x.c === code);
    if (!r) return Response.json({ error: "找不到這檔股票" }, { status: 404 });
    return Response.json({ c: r.c, n: r.n, m: r.m, price: r.price, prev: r.prev, open: r.open, high: r.high, low: r.low, vol: r.vol, tickVol: 0, ask: [], askV: [], bid: [], bidV: [], up: r.up, down: r.down, time: Date.now(), ind: r.ind, row: r, flow: null, avg: null, stale: true });
  }
  // 外盤／內盤：資金流記錄器累計的主動買、主動賣成交金額（億）
  const day = await getFlowDay().catch(() => null);
  const today = new Date(q.time + 8 * 3600e3).toISOString().slice(0, 10);
  const f = day?.date === today ? day.stocks[code] : undefined;
  const flow = f && f[1] > 0 ? { buy: (f[1] + f[0]) / 2, sell: (f[1] - f[0]) / 2, value: f[1] } : null;
  const avg = flow && q.vol ? Math.round(((flow.value * 1e8) / (q.vol * 1000)) * 100) / 100 : null;
  return Response.json({ ...q, ind: s?.ind ?? "", m: s?.m ?? q.m, row: toRow(q), flow, avg });
}
