import { isTradingNow } from "./market";

// 盤中常被輪詢的 API 讓 Vercel CDN 短暫快取：同一網址幾秒內重複要（例如頁首跑馬燈＋頁面本身、多個分頁）就不必重算。
// 登入檢查（proxy.ts）在 CDN 快取之前跑，沒登入一樣拿不到。盤中 10 秒、其他時間 5 分鐘。
export const liveCache = (tradingSec = 10) => ({
  "Cache-Control": isTradingNow()
    ? `public, max-age=0, s-maxage=${tradingSec}, stale-while-revalidate=${tradingSec * 3}`
    : "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
});
