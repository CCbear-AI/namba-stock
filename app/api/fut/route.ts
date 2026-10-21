import { txf } from "@/lib/taifex";

// 台指期近一（跑馬燈用）
export async function GET() {
  return Response.json(await txf());
}
