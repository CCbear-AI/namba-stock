import { getFlowDay } from "@/lib/store";
import { BY_CODE } from "@/lib/universe";

// ?date=2026-10-20（不給就回最新一天）
export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date") ?? undefined;
  const day = await getFlowDay(date);
  if (!day) return Response.json({ day: null });
  // 附上個股名稱與產業，前端才能列成分股
  const names: Record<string, [string, string]> = {};
  for (const c of Object.keys(day.stocks)) {
    const s = BY_CODE.get(c);
    if (s) names[c] = [s.n, s.ind];
  }
  // fresh：最後一筆在 3 分鐘內 → 盤中即時
  return Response.json({ day, names, fresh: Date.now() - day.updated < 3 * 60_000 });
}
