import { brokerDaily, brokerView, findBrokers, marketView, riverView, stockViewLive, trackView } from "@/lib/brokers";

// 分點進出（盤後資料，每晚掃描一次）
// ?view=stock&code=2330&days=1|5|20 · ?view=bk&code=&id=（分點 K 線逐日） · ?view=market&date= · ?view=river&days=5|10|25&code=&to= · ?view=broker&id=&days= · ?view=track&items=2330:1440,… · ?view=find&q=
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const view = sp.get("view") ?? "market";
  const code = sp.get("code") ?? "";
  const days = Number(sp.get("days")) || 0;
  // 抓富邦失敗（null）不要被 CDN 快取住，下次重抓
  const json = (v: unknown) => Response.json(v, { headers: { "Cache-Control": v == null ? "no-store" : "public, max-age=0, s-maxage=600" } });
  if (code && !/^\w{4,6}$/.test(code)) return Response.json({ error: "代號不對" }, { status: 400 });
  switch (view) {
    case "stock":
      return json(await stockViewLive(code, days === 1 || days === 20 ? days : 5));
    case "bk":
      return json(await brokerDaily(code, sp.get("id") ?? ""));
    case "market":
      return json(marketView(sp.get("date") ?? undefined));
    case "river":
      return json(riverView([5, 10, 25].includes(days) ? days : 5, code || undefined, sp.get("to") ?? undefined));
    case "broker":
      return json(brokerView(sp.get("id") ?? "", [1, 5, 20].includes(days) ? days : 1));
    case "track": {
      const items = (sp.get("items") ?? "").split(",").map((x) => x.split(":")).filter(([c, id]) => /^\w{4,6}$/.test(c ?? "") && id).slice(0, 50).map(([c, id]) => ({ c, id }));
      return json(trackView(items));
    }
    case "find":
      return json(findBrokers((sp.get("q") ?? "").trim()));
  }
  return Response.json({ error: "view 不對" }, { status: 400 });
}
