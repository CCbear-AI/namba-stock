import { listFlowDays } from "@/lib/store";

export async function GET() {
  return Response.json({ days: await listFlowDays() });
}
