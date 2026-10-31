import { after } from "next/server";
import { getCache } from "@vercel/functions";
import { aiReady } from "@/lib/ai";
import { checkup, checkupAi } from "@/lib/checkup";
import { BY_CODE } from "@/lib/universe";
import { ETFS } from "@/lib/etfs";
import { precomputed } from "@/lib/checkupStore";
import { getDaily } from "@/lib/history";

// 個股一眼體檢：燈號馬上回；AI 一句總結每檔每個交易日只問一次（存 Runtime Cache），
// 學校 AI 慢的時候先回 pending，AI 在背景算完存快取，前端稍後再來拿（跟 /api/levels 同一套）
export const maxDuration = 300;
const WAIT_MS = 3_000; // 燈號先出來，AI 總結靠前端每 15 秒再問

const cache = getCache({ namespace: "checkup" });
const inflight = new Map<string, Promise<string>>();

// ?code=2330
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!/^\d{4,6}[A-Z]?$/.test(code)) return Response.json({ error: "代號格式不對" }, { status: 400 });
  try {
    // 每天早上排程預先算好的（含 AI 總結）直接回
    const pre = precomputed(code, getDaily().dates.at(-1) ?? "");
    if (pre?.ai) return Response.json(pre, { headers: { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=86400" } });
    const x = await checkup(code);
    if ("error" in x) return Response.json(x, { status: 404 });
    const noStore = { headers: { "Cache-Control": "no-store" } };
    if (!aiReady()) return Response.json({ ...x, aiError: "AI 未設定" }, noStore);

    const key = `v2|${code}|${x.date}`;
    const hit = (await cache.get(key).catch(() => null)) as string | null;
    if (hit) return Response.json({ ...x, ai: hit }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } });

    let job = inflight.get(key);
    if (!job) {
      const busy = await cache.get(`${key}|busy`).catch(() => null);
      if (busy) return Response.json({ ...x, pending: true }, noStore);
      await cache.set(`${key}|busy`, 1, { ttl: 240 }).catch(() => {});
      job = checkupAi(x, BY_CODE.get(code)?.n ?? ETFS[code] ?? "")
        .then(async (s) => {
          await cache.set(key, s, { ttl: 86400 * 3 }).catch(() => {});
          return s;
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
