import { getQuotes, ch } from "@/lib/mis";
import { BY_CODE } from "@/lib/universe";
import { toRow, getMarket } from "@/lib/market";
import { getFlowDay } from "@/lib/store";
import { getDaily } from "@/lib/history";

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
  // 記錄器晚開始（例如排程延遲）的話，累計值不完整，不能拿來算均價、內外盤
  const full = day?.date === today && (day.points[0]?.t ?? "99") <= "09:05";
  const f = full ? day!.stocks[code] : undefined;
  let flow = f && f[1] > 0 ? { buy: (f[1] + f[0]) / 2, sell: (f[1] - f[0]) / 2, value: f[1] } : null;
  // 均價：盤後有官方日 K 就用官方（成交金額 ÷ 成交量），不然用記錄器累計
  const { dates, s: daily } = getDaily();
  const d = dates.at(-1) === today ? daily.get(code) : undefined;
  const dv = d?.v.at(-1), dval = d?.val.at(-1);
  let avg = dv && dval ? Math.round(((dval * 1e6) / (dv * 1000)) * 100) / 100 : null;
  if (avg == null && flow && q.vol) avg = Math.round(((flow.value * 1e8) / (q.vol * 1000)) * 100) / 100;
  if (avg != null && q.vol) flow = { buy: flow?.buy ?? 0, sell: flow?.sell ?? 0, value: Math.round(((q.vol * 1000 * avg) / 1e8) * 100) / 100 };
  return Response.json({ ...q, ind: s?.ind ?? "", m: s?.m ?? q.m, row: toRow(q), flow, avg });
}
