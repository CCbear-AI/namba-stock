// 期貨、選擇權籌碼（期交所盤後 CSV）
// 用法：npm run futures   （補最近 28 天）
// 輸出：data/futures.json  日期 → { tx: [外資, 投信, 自營商] 台指期淨未平倉口數, top10: 前十大交易人淨部位,
//        pcr: 選擇權 Put/Call 未平倉比%, retail: 小台散戶多空比%, fOpt: [外資買權淨金額, 外資賣權淨金額](億) }
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Day = { tx: [number, number, number]; top10: number; pcr: number; retail: number; fOpt: [number, number] };
const FILE = "data/futures.json";
const n = (s?: string) => Number(String(s ?? "").replace(/,/g, "").trim()) || 0;
const slash = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "/");

async function csv(path: string, body: Record<string, string>) {
  const r = await fetch(`https://www.taifex.com.tw/cht/3/${path}`, {
    method: "POST",
    headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const text = new TextDecoder("big5").decode(await r.arrayBuffer());
  if (text.includes("<!DOCTYPE") || text.includes("<html")) throw new Error(`期交所 ${path} 回傳錯誤頁（日期範圍超過一個月或還沒有資料）`);
  return text.trim().split(/\r?\n/).slice(1).map((l) => l.split(",").map((x) => x.trim())).filter((r) => r.length > 4);
}

async function main() {
  const store: Record<string, Day> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  // 盤後資料約 15:00 後公布，之前只抓到昨天
  const now = new Date(Date.now() + 8 * 3600e3);
  const end = now.getUTCHours() >= 15 ? now : new Date(now.getTime() - 864e5);
  const start = new Date(end.getTime() - 28 * 864e5); // 期交所一次最多查一個月
  const range = { queryStartDate: slash(start), queryEndDate: slash(end) };
  const days: Record<string, Partial<Day> & { mtxInst?: number; mtxOI?: number }> = {};
  const d = (s: string) => (days[s.replace(/\//g, "-")] ??= {});
  const who = (s: string): 0 | 1 | 2 | -1 => (s.startsWith("外資") ? 0 : s === "投信" ? 1 : s === "自營商" ? 2 : -1);

  // 台指期、小台三大法人
  for (const r of await csv("futContractsDateDown", { ...range, commodityId: "TXF" })) {
    const k = who(r[2]); if (k === -1) continue;
    (d(r[0]).tx ??= [0, 0, 0])[k] = n(r[13]);
  }
  for (const r of await csv("futContractsDateDown", { ...range, commodityId: "MXF" })) {
    if (who(r[2]) < 0) continue;
    const x = d(r[0]); x.mtxInst = (x.mtxInst ?? 0) + n(r[13]);
  }
  // 小台全市場未平倉（一般交易時段、所有月份加總）
  for (const r of await csv("futDataDown", { down_type: "1", commodity_id: "MTX", ...range })) {
    if (r[17] !== "一般" || r[2].includes("W")) continue;
    const x = d(r[0]); x.mtxOI = (x.mtxOI ?? 0) + n(r[11]);
  }
  // 前十大交易人（台指期全部月份）
  for (const r of await csv("largeTraderFutDown", range)) {
    if (r[1] !== "TX" || r[3] !== "999999" || r[4] !== "0") continue;
    d(r[0]).top10 = n(r[7]) - n(r[8]);
  }
  // 外資選擇權未平倉淨金額
  for (const r of await csv("callsAndPutsDateDown", { ...range, commodityId: "TXO" })) {
    if (who(r[3]) !== 0) continue;
    const x = d(r[0]); (x.fOpt ??= [0, 0])[r[2] === "CALL" ? 0 : 1] = Math.round(n(r[15]) / 1e3) / 100;
  }
  // Put/Call 未平倉比
  const pc = await (await fetch("https://openapi.taifex.com.tw/v1/PutCallRatio", { headers: { "User-Agent": "Mozilla/5.0" } })).json();
  for (const x of pc as Record<string, string>[]) {
    const k = `${x.Date.slice(0, 4)}-${x.Date.slice(4, 6)}-${x.Date.slice(6, 8)}`;
    if (days[k]) days[k].pcr = n(x["PutCallOIRatio%"]);
  }

  for (const [k, x] of Object.entries(days)) {
    if (!x.tx) continue;
    store[k] = {
      tx: x.tx as Day["tx"], top10: x.top10 ?? 0, pcr: x.pcr ?? store[k]?.pcr ?? 0,
      // 散戶多空比 =（散戶多單 − 散戶空單）÷ 全市場未平倉；散戶 = 全市場 − 三大法人 → 等於 −法人淨部位 ÷ 未平倉
      retail: x.mtxOI ? Math.round((-(x.mtxInst ?? 0) / x.mtxOI) * 10000) / 100 : 0,
      fOpt: (x.fOpt ?? [0, 0]) as Day["fOpt"],
    };
  }
  const keys = Object.keys(store).sort().slice(-60);
  writeFileSync(FILE, JSON.stringify(Object.fromEntries(keys.map((k) => [k, store[k]]))));
  const last = keys.at(-1)!;
  console.log("完成", keys.length, "天，最新", last, JSON.stringify(store[last]));
}

main().catch((e) => { console.error(e); process.exit(1); });
