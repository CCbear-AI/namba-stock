import { getMarket } from "@/lib/market";
import { scan } from "@/lib/scan";

// 全市場掃描（量比、RVOL、均線、新高新低、法人連買…）
export async function GET() {
  try {
    const m = await getMarket();
    return Response.json({ time: m.time, open: m.open, rows: scan(m) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
