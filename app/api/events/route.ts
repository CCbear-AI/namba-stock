import { getFlowDay } from "@/lib/store";

// 盤中動態、漲跌停首次時間（資金流記錄器每 30 秒寫一次）
export async function GET() {
  const day = await getFlowDay().catch(() => null);
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  if (!day) return Response.json({ date: null, events: [], limits: {}, ath: {}, atl: {} });
  return Response.json({ date: day.date, today: day.date === today, events: (day.events ?? []).slice(-120).reverse(), limits: day.limits ?? {}, ath: day.ath ?? {}, atl: day.atl ?? {} });
}
