import { getDaily } from "@/lib/history";

// 多檔近 N 日收盤（畫列表小走勢）。?codes=2330,2454&n=60（最多 60 檔、120 日）
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const codes = (sp.get("codes") ?? "").split(",").filter(Boolean).slice(0, 60);
  const n = Math.min(120, Math.max(5, Number(sp.get("n")) || 20));
  const { s } = getDaily();
  const out: Record<string, number[]> = {};
  for (const c of codes) {
    const x = s.get(c);
    if (x) out[c] = x.c.filter((v) => !Number.isNaN(v)).slice(-n);
  }
  return Response.json(out);
}
