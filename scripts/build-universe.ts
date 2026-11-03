// 產生 data/universe.json：上市＋上櫃普通股清單（代號、名稱、市場、產業、發行股數）
// 用法：npm run universe
import { writeFileSync, mkdirSync } from "node:fs";
import { INDUSTRY } from "../lib/industries";

type Row = { c: string; n: string; m: "tse" | "otc"; ind: string; sh: number };

// 官方 openapi 偶爾中途斷線（11/3 GitHub 上 "other side closed"）→ 逾時＋重試 3 次
async function getJson(url: string) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= 3) throw e;
      console.log(`第 ${i} 次抓取失敗，10 秒後重試：${url}`);
      await new Promise((ok) => setTimeout(ok, 10000));
    }
  }
}

async function main() {
  const L: Record<string, string>[] = await getJson("https://openapi.twse.com.tw/v1/opendata/t187ap03_L");
  const O: Record<string, string>[] = await getJson("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O");
  const rows: Row[] = [];
  for (const x of L) {
    const ind = INDUSTRY[x["產業別"]];
    if (!ind || ind === "存託憑證") continue;
    rows.push({ c: x["公司代號"].trim(), n: x["公司簡稱"].trim(), m: "tse", ind, sh: Number(x["已發行普通股數或TDR原股發行股數"]) || 0 });
  }
  for (const x of O) {
    const ind = INDUSTRY[x.SecuritiesIndustryCode];
    if (!ind || ind === "存託憑證" || ind === "管理股票") continue;
    rows.push({ c: x.SecuritiesCompanyCode.trim(), n: x.CompanyAbbreviation.trim(), m: "otc", ind, sh: Number(x.IssueShares) || 0 });
  }
  rows.sort((a, b) => a.c.localeCompare(b.c));
  mkdirSync("data", { recursive: true });
  writeFileSync("data/universe.json", JSON.stringify(rows));
  console.log(`universe: ${rows.length} 檔（上市 ${rows.filter((r) => r.m === "tse").length}、上櫃 ${rows.filter((r) => r.m === "otc").length}）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
