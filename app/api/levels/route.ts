import { after } from "next/server";
import { getCache } from "@vercel/functions";
import { getBars } from "@/lib/bars";
import { aiReady } from "@/lib/ai";
import { aiLevels, formulaLevels, type SrResult } from "@/lib/srAi";
import type { TF } from "@/lib/yahoo";

// 學校 AI 有時要 80 秒以上：先等一小段，來不及就先回公式版，AI 在背景繼續算完存進快取，前端稍後再來拿
export const maxDuration = 300;
const WAIT_MS = 20_000;

// Vercel Runtime Cache：同區域所有函式共用（本機自動退回記憶體）
const cache = getCache({ namespace: "levels" });
// 同一個執行個體裡正在算的，避免重複問 AI
const inflight = new Map<string, Promise<SrResult>>();

// ?code=2330&tf=1d|1wk|1mo|5m|15m|30m|60m
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = sp.get("code") ?? "";
  const tf = (sp.get("tf") ?? "1d") as TF;
  if (!code || tf === "1m") return Response.json({ error: "參數錯誤" }, { status: 400 });
  try {
    const bars = await getBars(code, tf);
    if (bars.length < 20) return Response.json({ levels: [], summary: "K 線太少，無法判讀。", model: "formula", asOf: "", price: 0 });
    const intraday = tf.endsWith("m") && tf !== "1mo";
    const key = `${code}|${tf}|${bars[bars.length - 1].time}`;
    const ok = (r: SrResult) => Response.json(r, { headers: { "Cache-Control": `public, max-age=0, s-maxage=${intraday ? 900 : 3600}, stale-while-revalidate=86400` } });
    // 公式版不快取，下次再試 AI
    const fallback = (extra: { aiError?: string; pending?: boolean }) =>
      Response.json({ ...formulaLevels(bars, tf), ...extra }, { headers: { "Cache-Control": "no-store" } });

    const hit = (await cache.get(key).catch(() => null)) as SrResult | null;
    if (hit) return ok(hit);
    if (!aiReady()) return fallback({ aiError: "AI 未設定" });

    let job = inflight.get(key);
    if (!job) {
      // 別的執行個體已經在算：不重複問，請前端稍後再來
      const busy = await cache.get(`${key}|busy`).catch(() => null);
      if (busy) return fallback({ pending: true });
      await cache.set(`${key}|busy`, 1, { ttl: 240 }).catch(() => {});
      job = aiLevels(bars, tf)
        .then(async (r) => {
          await cache.set(key, r, { ttl: intraday ? 3600 : 86400 * 3 }).catch(() => {});
          return r;
        })
        .finally(async () => {
          inflight.delete(key);
          await cache.delete(`${key}|busy`).catch(() => {});
        });
      inflight.set(key, job);
    }

    const r = await Promise.race([job, new Promise<null>((res) => setTimeout(() => res(null), WAIT_MS))]).catch((e: Error) => e);
    if (r instanceof Error) return fallback({ aiError: r.message });
    if (r) return ok(r);
    // 還沒算完：回應先送出，函式繼續等 AI 存快取
    const pending = job;
    after(() => pending.catch(() => {}));
    return fallback({ pending: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
