// 全市場最新月營收（證交所、櫃買中心開放資料，一次抓全部，不撞 FinMind 每小時 300 次的限制）
/** 最新月營收年增率（上市 t187ap05_L、上櫃 mopsfin_t187ap05_O） */
export async function revenue() {
  const out = new Map<string, { ym: string; yoy: number }>();
  for (const u of ["https://openapi.twse.com.tw/v1/opendata/t187ap05_L", "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O"]) {
    try {
      const j = (await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) })).json()) as Record<string, string>[];
      for (const x of j) {
        const yoy = Number(x["營業收入-去年同月增減(%)"]);
        if (!Number.isFinite(yoy) || !Number(x["營業收入-去年當月營收"])) continue;
        out.set(String(x["公司代號"]).trim(), { ym: `${Number(String(x["資料年月"]).slice(-2))}月`, yoy: Math.round(yoy * 10) / 10 });
      }
    } catch (e) { console.log("月營收抓不到", u, (e as Error).message); }
  }
  return out;
}
