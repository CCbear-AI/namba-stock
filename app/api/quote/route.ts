import { getQuotes, ch } from "@/lib/mis";
import { BY_CODE } from "@/lib/universe";
import { toRow } from "@/lib/market";

// 個股即時報價（含五檔）。?code=2330
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const s = BY_CODE.get(code);
  // 不在清單內（例如 ETF）就上市、上櫃都查
  const chs = s ? [ch(s.m, code)] : [ch("tse", code), ch("otc", code)];
  const qs = await getQuotes(chs);
  const q = qs.find((x) => x.price > 0) ?? qs[0];
  if (!q) return Response.json({ error: "找不到這檔股票" }, { status: 404 });
  return Response.json({ ...q, ind: s?.ind ?? "", m: s?.m ?? q.m, row: toRow(q) });
}
