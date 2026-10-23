import { getBars } from "@/lib/bars";
import type { TF } from "@/lib/yahoo";

// ?code=2330 | TAIEX | OTC | sector:t24  &tf=1m|5m|15m|30m|60m|1d|1wk|1mo
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  try {
    return Response.json({ bars: await getBars(sp.get("code") ?? "", (sp.get("tf") ?? "1d") as TF) });
  } catch (e) {
    return Response.json({ bars: [], error: (e as Error).message }, { status: 502 });
  }
}
