import { getQuotes, ch } from "@/lib/mis";
import { ETFS } from "@/lib/etfs";

// 不在全市場掃描裡的代號（ETF 等）的簡易報價。?codes=0050,00878（最多 30 檔，上市上櫃都查）
const cache = new Map<string, { at: number; v: unknown }>();
export async function GET(req: Request) {
  const codes = (new URL(req.url).searchParams.get("codes") ?? "").split(",").filter((c) => /^\w{4,6}$/.test(c)).slice(0, 30);
  const key = codes.join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return Response.json(hit.v);
  const qs = await getQuotes(codes.flatMap((c) => [ch("tse", c), ch("otc", c)]), 8000);
  const out: Record<string, { c: string; n: string; price: number; prev: number; chg: number; pct: number }> = {};
  for (const q of qs) {
    if (!q.price || out[q.c]) continue;
    const chg = q.prev ? q.price - q.prev : 0;
    out[q.c] = { c: q.c, n: ETFS[q.c] ?? q.n, price: q.price, prev: q.prev, chg: Math.round(chg * 100) / 100, pct: q.prev ? Math.round((chg / q.prev) * 10000) / 100 : 0 };
  }
  cache.set(key, { at: Date.now(), v: out });
  return Response.json(out);
}
