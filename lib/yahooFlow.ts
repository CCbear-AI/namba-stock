// Yahoo 股市的累積內盤／外盤成交量（張）與均價：主動買賣淨額用這個算才會跟券商看盤軟體、里長伯一致
// 一次最多 50 檔（再多會回 400），5 個請求同時跑，全市場約 1.3 秒
export type InOut = { inL: number; outL: number; avg: number };

const URL = "https://tw.stock.yahoo.com/_td-stock/api/resource/StockServices.stockList;fields=avgPrice%2CinMarket%2CoutMarket;symbols=";
const n = (v: unknown) => Number(String(v ?? "").replace(/,/g, "")) || 0;

export async function yahooInOut(stocks: { c: string; m: "tse" | "otc" }[]): Promise<Map<string, InOut>> {
  const out = new Map<string, InOut>();
  const chunks: string[][] = [];
  for (let i = 0; i < stocks.length; i += 50) chunks.push(stocks.slice(i, i + 50).map((s) => `${s.c}.${s.m === "otc" ? "TWO" : "TW"}`));
  let i = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (i < chunks.length) {
      const c = chunks[i++];
      try {
        const r = await fetch(URL + encodeURIComponent(c.join(",")), { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
        const j = await r.json();
        if (!Array.isArray(j)) continue;
        for (const x of j) {
          if (x.inMarket == null || x.outMarket == null) continue;
          // 均價：成交金額（百萬元）÷ 成交股數，比 avgPrice（四捨五入到整數）精確
          const vol = n(x.volume), turnover = n(x.turnoverM) * 1e6;
          const avg = vol && turnover ? turnover / vol : n(x.avgPrice);
          out.set(String(x.systexId ?? x.symbol).replace(/\.TWO?$/, ""), { inL: n(x.inMarket), outL: n(x.outMarket), avg });
        }
      } catch { /* 這一批抓不到就算了，下一輪再來 */ }
    }
  }));
  return out;
}
