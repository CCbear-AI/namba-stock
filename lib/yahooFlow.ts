// Yahoo 股市的累積內盤／外盤成交量（張）與均價：主動買賣淨額用這個算才會跟券商看盤軟體、里長伯一致
// 一次最多 50 檔（再多會回 400），5 個請求同時跑，全市場約 1.3 秒
export type InOut = { inL: number; outL: number; avg: number };

const URL = "https://tw.stock.yahoo.com/_td-stock/api/resource/StockServices.stockList;fields=avgPrice%2CinMarket%2CoutMarket;symbols=";
const n = (v: unknown) => Number(String(v ?? "").replace(/,/g, "")) || 0;

/** 一批批問 Yahoo，每一檔交給 each 處理 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function stockList(stocks: { c: string; m: "tse" | "otc" }[], each: (code: string, x: any) => void) {
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
        for (const x of j) each(String(x.systexId ?? x.symbol).replace(/\.TWO?$/, ""), x);
      } catch { /* 這一批抓不到就算了，下一輪再來 */ }
    }
  }));
}

export async function yahooInOut(stocks: { c: string; m: "tse" | "otc" }[]): Promise<Map<string, InOut>> {
  const out = new Map<string, InOut>();
  await stockList(stocks, (code, x) => {
    if (x.inMarket == null || x.outMarket == null) return;
    // 均價：成交金額（百萬元）÷ 成交股數，比 avgPrice（四捨五入到整數）精確
    const vol = n(x.volume), turnover = n(x.turnoverM) * 1e6;
    const avg = vol && turnover ? turnover / vol : n(x.avgPrice);
    out.set(code, { inL: n(x.inMarket), outL: n(x.outMarket), avg });
  });
  return out;
}

/** 最新成交價（MIS 這一刻沒給成交價的股票用這個補） */
export async function yahooPrices(stocks: { c: string; m: "tse" | "otc" }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await stockList(stocks, (code, x) => { const p = n(x.price?.raw); if (p > 0) out.set(code, p); });
  return out;
}
