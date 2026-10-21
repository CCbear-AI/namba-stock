import { yahooBars, yahooSymbol, resample, type TF } from "@/lib/yahoo";
import { sectorDaily, sectorIntraday } from "@/lib/sector";
import { BY_CODE } from "@/lib/universe";
import { misOhlc } from "@/lib/misStats";
import type { Bar } from "@/lib/types";

// ?code=2330 | TAIEX | OTC | sector:t24  &tf=1m|5m|15m|30m|60m|1d|1wk|1mo
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = sp.get("code") ?? "";
  const tf = (sp.get("tf") ?? "1d") as TF;
  try {
    let bars: Bar[];
    if (code === "OTC") {
      // 櫃買指數：分時用 MIS 每分鐘資料，日 K 用櫃買歷史（data/sector-otc.json）＋今天即時
      if (tf.endsWith("m") && tf !== "1mo") {
        const m1 = (await misOhlc("OTC")).minutes.map((x) => ({ time: Math.floor(x.t / 1000) - 60, open: x.c, high: x.c, low: x.c, close: x.c, volume: x.v }));
        bars = tf === "1m" ? m1 : groupMinutes(m1, Number(tf.slice(0, -1)));
      } else {
        const d = await sectorDaily("o00");
        bars = tf === "1d" ? d : resample(d, tf as "1wk" | "1mo");
      }
    } else if (code.startsWith("sector:")) {
      const id = code.slice(7);
      if (tf.endsWith("m") && tf !== "1mo") {
        const m1 = await sectorIntraday(id);
        bars = tf === "1m" ? m1 : groupMinutes(m1, Number(tf.slice(0, -1)));
      } else {
        const d = await sectorDaily(id);
        bars = tf === "1d" ? d : resample(d, tf as "1wk" | "1mo");
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
