import { getBars } from "@/lib/bars";
import { aiReady } from "@/lib/ai";
import { aiLevels, formulaLevels, type SrResult } from "@/lib/srAi";
import type { TF } from "@/lib/yahoo";

export const maxDuration = 90;

// 同一檔同一週期同一根 K 線只問一次 AI（另外靠 CDN 快取；前端網址帶最新 K 線日期，換日自動重算）
const memo = new Map<string, SrResult>();

// ?code=2330&tf=1d|1wk|1mo|5m|15m|30m|60m
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = sp.get("code") ?? "";
  const tf = (sp.get("tf") ?? "1d") as TF;
  if (!code || tf === "1m") return Response.json({ error: "參數錯誤" }, { status: 400 });
  try {
    const bars = await getBars(code, tf);
    if (bars.length < 20) return Response.json({ levels: [], summary: "K 線太少，無法判讀。", model: "formula", asOf: "", price: 0 });
    const key = `${code}|${tf}|${bars[bars.length - 1].time}`;
    let r = memo.get(key);
    let aiError: string | undefined;
    if (!r && aiReady()) {
      try {
        r = await aiLevels(bars, tf);
        memo.set(key, r);
        if (memo.size > 500) memo.delete(memo.keys().next().value!);
      } catch (e) { aiError = (e as Error).message; }
    }
    if (!r) {
      // 學校 AI 忙碌或沒設定：先給程式計算版，不快取，下次再試 AI
      return Response.json({ ...formulaLevels(bars, tf), aiError: aiError ?? "AI 未設定" }, { headers: { "Cache-Control": "no-store" } });
    }
    const intraday = tf.endsWith("m") && tf !== "1mo";
    return Response.json(r, { headers: { "Cache-Control": `public, max-age=0, s-maxage=${intraday ? 900 : 3600}, stale-while-revalidate=86400` } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
