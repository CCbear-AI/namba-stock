import { getMarket } from "@/lib/market";

// ?lite=1 只回指數與漲跌家數（跑馬燈用）
export async function GET(req: Request) {
  try {
    const m = await getMarket();
    if (new URL(req.url).searchParams.get("lite")) return Response.json({ ...m, stocks: [] });
    return Response.json(m);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
