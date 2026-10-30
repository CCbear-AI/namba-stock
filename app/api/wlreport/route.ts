import { after } from "next/server";
import { getCache } from "@vercel/functions";
import { aiReady } from "@/lib/ai";
import { wlFacts, wlAi } from "@/lib/wlreport";

// 自選股收盤報告：數字馬上回；AI 重點每個群組（同一組股票）每個交易日只寫一次，存 Runtime Cache，
// 學校 AI 慢的時候先回 pending，前端每 15 秒再問（跟 /api/checkup 同一套）
export const maxDuration = 300;
const WAIT_MS = 3_000;

const cache = getCache({ namespace: "wlreport" });
type Ai = { headline: string; points: string[] };
const inflight = new Map<string, Promise<Ai>>();

// ?codes=2330,2317&name=我的自選
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const codes = (sp.get("codes") ?? "").split(",").filter((c) => /^\d{4,6}[A-Z]?$/.test(c));
  const name = (sp.get("name") ?? "自選股").slice(0, 20);
  if (!codes.length) return Response.json({ error: "群組裡還沒有股票" }, { status: 400 });
  try {
    const x = wlFacts(codes);
    if ("error" in x) return Response.json(x, { status: 404 });
    const noStore = { headers: { "Cache-Control": "no-store" } };
    if (!x.rows.length) return Response.json({ ...x, aiError: "群組裡的股票沒有盤後資料" }, noStore);
    if (!aiReady()) return Response.json({ ...x, aiError: "AI 未設定" }, noStore);

    // 同一組股票、同一天、分點資料有沒有進來 → 同一份 AI 重點
    const key = `v1|${[...new Set(x.rows.map((r) => r.c))].sort().join(",")}|${x.date}|${x.brokers ? "b" : "-"}|${x.news.length}`;
    const hit = (await cache.get(key).catch(() => null)) as Ai | null;
    if (hit) return Response.json({ ...x, ai: hit }, noStore);

    let job = inflight.get(key);
    if (!job) {
      const busy = await cache.get(`${key}|busy`).catch(() => null);
      if (busy) return Response.json({ ...x, pending: true }, noStore);
      await cache.set(`${key}|busy`, 1, { ttl: 240 }).catch(() => {});
      job = wlAi(x, name)
        .then(async (a) => {
          await cache.set(key, a, { ttl: 86400 * 3 }).catch(() => {});
          return a;
        })
        .finally(async () => {
          inflight.delete(key);
          await cache.delete(`${key}|busy`).catch(() => {});
        });
      inflight.set(key, job);
    }

    const r = await Promise.race([job, new Promise<null>((res) => setTimeout(() => res(null), WAIT_MS))]).catch((e: Error) => e);
    if (r instanceof Error) return Response.json({ ...x, aiError: r.message }, noStore);
    if (r) return Response.json({ ...x, ai: r }, noStore);
    const pending = job;
    after(() => pending.catch(() => {}));
    return Response.json({ ...x, pending: true }, noStore);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
