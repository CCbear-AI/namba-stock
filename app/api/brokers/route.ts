import { adjustedConc, dtView, handoffMarket, rankView, stockHandoff, tw50View } from "@/lib/brokerFlow";
import { brokerScore, scoreView } from "@/lib/brokerScore";
import { brokerDaily, brokerView, findBrokers, marketView, riverView, stockViewLive, trackView } from "@/lib/brokers";

// 分點進出（盤後資料，每晚掃描一次）
// ?view=stock&code=2330&days=1|5|20 · ?view=handoff · ?view=tw50&codes=…&to= · ?view=dt · ?view=rank&codes=… · ?view=bk&code=&id=（分點 K 線逐日） · ?view=market&date= · ?view=river&days=5|10|25&code=&to= · ?view=broker&id=&days= · ?view=track&items=2330:1440,… · ?view=find&q= · ?view=score&h=1|5|10|20&min=
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const view = sp.get("view") ?? "market";
  const code = sp.get("code") ?? "";
  const days = Number(sp.get("days")) || 0;
  // 抓富邦失敗（null）不要被 CDN 快取住，下次重抓
  const json = (v: unknown) => Response.json(v, { headers: { "Cache-Control": v == null ? "no-store" : "public, max-age=0, s-maxage=600" } });
  const codes = () => (sp.get("codes") ?? "").split(",").filter((c) => /^\w{4,6}$/.test(c)).slice(0, 300);
  if (code && !/^\w{4,6}$/.test(code)) return Response.json({ error: "代號不對" }, { status: 400 });
  switch (view) {
    case "stock": {
      const v = await stockViewLive(code, days === 1 || days === 20 ? days : 5);
      if ("error" in v) return json(v);
      // 賣方集中度百分位改用扣掉價量因素後的；加上這一週的換手品質
      const adj = adjustedConc().get(code);
      return json({ ...v, conc: { ...v.conc, pctile: adj?.pctile ?? v.conc.pctile, adjusted: !!adj }, handoff: stockHandoff(code) });
    }
    case "handoff":
      return json(handoffMarket());
    case "tw50":
      return json(tw50View(codes(), sp.get("to") ?? undefined));
    case "dt":
      return json(dtView());
    case "rank":
      return json(rankView(codes()));
    case "bk":
      return json(await brokerDaily(code, sp.get("id") ?? ""));
    case "market":
      return json(marketView(sp.get("date") ?? undefined));
    case "river":
      return json(riverView([5, 10, 25].includes(days) ? days : 5, code || undefined, sp.get("to") ?? undefined));
    case "broker": {
      const id = sp.get("id") ?? "";
      return json({ ...brokerView(id, [1, 5, 20].includes(days) ? days : 1), score: brokerScore(id) });
    }
    case "score": {
      const h = Number(sp.get("h"));
      return json(scoreView(([1, 5, 10, 20] as const).find((x) => x === h) ?? 5, Math.min(200, Math.max(5, Number(sp.get("min")) || 20))));
    }
    case "track": {
      const items = (sp.get("items") ?? "").split(",").map((x) => x.split(":")).filter(([c, id]) => /^\w{4,6}$/.test(c ?? "") && id).slice(0, 50).map(([c, id]) => ({ c, id }));
      return json(trackView(items));
    }
    case "find":
      return json(findBrokers((sp.get("q") ?? "").trim()));
  }
  return Response.json({ error: "view 不對" }, { status: 400 });
}
