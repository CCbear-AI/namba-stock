import { yahooBars, yahooSymbol } from "@/lib/yahoo";
import { BY_CODE } from "@/lib/universe";

// 多檔當日分時收盤價（畫列表裡的小走勢）。?codes=2330,2454（最多 60 檔，每 3 分鐘一點）
export async function GET(req: Request) {
  const codes = (new URL(req.url).searchParams.get("codes") ?? "").split(",").filter(Boolean).slice(0, 60);
  const out: Record<string, number[]> = {};
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < codes.length) {
      const c = codes[i++];
      const s = BY_CODE.get(c);
      try {
        const bars = await yahooBars(c === "TAIEX" ? "^TWII" : yahooSymbol(c, s?.m ?? "tse"), "1m");
        // 只留今天（最後一根的日期）；每 5 分鐘取一點就夠畫
        const last = bars.at(-1);
        if (!last) continue;
        const day = Math.floor((last.time + 8 * 3600) / 86400);
        out[c] = bars.filter((b, k) => Math.floor((b.time + 8 * 3600) / 86400) === day && (k % 3 === 0 || k === bars.length - 1)).map((b) => b.close);
      } catch { /* 抓不到就不畫 */ }
    }
  }));
  return Response.json(out);
}
