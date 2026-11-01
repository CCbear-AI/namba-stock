// 除權息調整係數（給相似股等「看形狀」的功能還原權值用）
// 來源：證交所 TWT49U 除權除息計算結果表、櫃買 exDailyQ；係數＝除權息參考價 ÷ 除權息前收盤價
// 用法：npm run exright            只更新最近 2 個月（daily-data 每天跑）
//       npm run exright -- --all   從日 K 起始月（2025-08）全部重抓
// 輸出：data/exright.json  { updated, ev: { 代號: [[除權息日, 係數], ...] } }
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FILE = "data/exright.json";
type Store = { updated: string; ev: Record<string, [string, number][]> };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (s: string) => Number(String(s).replace(/,/g, "").trim());
/** 115年08月03日／115/08/03 → 2026-08-03 */
const roc = (s: string) => { const m = s.match(/(\d{2,3})\D+(\d{1,2})\D+(\d{1,2})/); return m ? `${Number(m[1]) + 1911}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : ""; };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function get(url: string) {
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) });
      if (r.ok) return await r.json();
    } catch { /* 重試 */ }
    await sleep(3000 * (k + 1));
  }
  throw new Error(`抓不到 ${url}`);
}

/** 一個月份的上市＋上櫃除權息：[代號, 日期, 係數] */
async function month(y: number, m: number): Promise<[string, string, number][]> {
  const a = new Date(Date.UTC(y, m - 1, 1)), b = new Date(Date.UTC(y, m, 0));
  const out: [string, string, number][] = [];
  const add = (code: string, date: string, prev: number, ref: number) => {
    code = code.trim();
    if (!/^\w{4,6}$/.test(code) || !date || !(prev > 0) || !(ref > 0) || ref > prev * 1.5) return;
    if (Math.abs(ref / prev - 1) < 1e-6) return;
    out.push([code, date, Math.round((ref / prev) * 1e6) / 1e6]);
  };
  const tw = await get(`https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=${ymd(a).replace(/-/g, "")}&endDate=${ymd(b).replace(/-/g, "")}&response=json`);
  for (const r of tw.data ?? []) add(r[1], roc(r[0]), num(r[3]), num(r[4]));
  await sleep(1500);
  const tp = await get(`https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate=${ymd(a).replace(/-/g, "/")}&endDate=${ymd(b).replace(/-/g, "/")}&response=json`);
  for (const r of tp.tables?.[0]?.data ?? []) add(r[1], roc(r[0]), num(r[3]), num(r[4]));
  await sleep(1500);
  return out;
}

async function main() {
  const all = process.argv.includes("--all") || !existsSync(FILE);
  const store: Store = !all && existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { updated: "", ev: {} };
  const now = new Date();
  const start = all ? new Date(Date.UTC(2025, 7, 1)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  let n = 0;
  for (let d = start; d <= now; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const rows = await month(d.getUTCFullYear(), d.getUTCMonth() + 1);
    for (const [c, date, f] of rows) {
      const list = (store.ev[c] ??= []);
      const i = list.findIndex((x) => x[0] === date);
      if (i >= 0) list[i] = [date, f]; else { list.push([date, f]); n++; }
    }
    console.log(`${ymd(d).slice(0, 7)} ${rows.length} 筆`);
  }
  for (const list of Object.values(store.ev)) list.sort((p, q) => p[0].localeCompare(q[0]));
  store.updated = ymd(now);
  writeFileSync(FILE, JSON.stringify(store));
  console.log(`新增 ${n} 筆，共 ${Object.keys(store.ev).length} 檔`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
