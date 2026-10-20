import { yahooBars, yahooSymbol, resample, type TF } from "@/lib/yahoo";
import { sectorDaily, sectorIntraday } from "@/lib/sector";
import { BY_CODE } from "@/lib/universe";
import type { Bar } from "@/lib/types";

// ?code=2330 | TAIEX | sector:t24  &tf=1m|5m|1d|1wk|1mo
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = sp.get("code") ?? "";
  const tf = (sp.get("tf") ?? "1d") as TF;
  try {
    let bars: Bar[];
    if (code.startsWith("sector:")) {
      const id = code.slice(7);
      if (tf === "1m" || tf === "5m") {
        const m1 = await sectorIntraday(id);
        bars = tf === "1m" ? m1 : groupMinutes(m1, 5);
      } else {
        const d = await sectorDaily(id);
        bars = tf === "1d" ? d : resample(d, tf);
      }
    } else {
      const s = BY_CODE.get(code);
      let m: "tse" | "otc" = s?.m ?? "tse";
      bars = await yahooBars(yahooSymbol(code, m), tf);
      if (!bars.length && !s) { m = "otc"; bars = await yahooBars(yahooSymbol(code, m), tf); }
    }
    return Response.json({ bars });
  } catch (e) {
    return Response.json({ bars: [], error: (e as Error).message }, { status: 502 });
  }
}

function groupMinutes(bars: Bar[], n: number): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const key = Math.floor(b.time / (n * 60)) * n * 60;
    const last = out[out.length - 1];
    if (last && last.time === key) { last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low); last.close = b.close; last.volume += b.volume; }
    else out.push({ ...b, time: key });
  }
  return out;
}
