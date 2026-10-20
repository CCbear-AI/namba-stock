import { sectorQuotes } from "@/lib/sector";

export async function GET() {
  try {
    return Response.json({ sectors: await sectorQuotes() });
  } catch (e) {
    return Response.json({ sectors: [], error: (e as Error).message }, { status: 502 });
  }
}
