import { newsOf } from "@/lib/news";
import { stockNewsOf } from "@/lib/stockNews";

// ?code=2330 → 近 60 天重大訊息（items）＋鉅亨網個股新聞（news）＋AI 近一週重點（digest）；排程每天寫檔，這裡只讀
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!/^\d{4,6}[A-Z]?$/.test(code)) return Response.json({ error: "代號格式不對" }, { status: 400 });
  return Response.json({ items: newsOf(code), ...stockNewsOf(code) }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600" } });
}
