// 分點進出：每天掃一次「成交值夠的股票」各自買超前 15、賣超前 15 的券商分點（富邦 DJ 公開頁，非正式 API）
// 用法：npm run brokers                 掃 data/daily 最新一天
//       npm run brokers -- 2026-10-28    掃指定日期
//       npm run brokers -- --backfill 60 補最近 60 個交易日裡還沒有的日子
//       npm run brokers -- --test 30     只抓 30 檔看速度、不存檔
// 輸出 data/brokers/日期.json：{ date, n: {分點代號: 名稱}, h: {分點代號: 富邦 BHID（不同才記）}, s: {股票: [推算成交量(張), 分點, 買進, 賣出, 分點, 買進, 賣出, ...]} }
// 只保留最近 KEEP 個交易日
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { getDaily } from "../lib/history";
import { fetchZco } from "../lib/fubon";

const DIR = "data/brokers";
const KEEP = 70;
const MIN_VAL = 10; // 近 20 日平均成交值（百萬）至少 1,000 萬才掃，約 1,000 檔（不含 ETF）
const WORKERS = 6;

function universe(dateIdx: number) {
  const { s } = getDaily();
  const out: string[] = [];
  for (const [code, x] of s) {
    if (!/^[1-9]\d{3}$/.test(code) || Number.isNaN(x.c[dateIdx])) continue;
    const a = x.val.slice(Math.max(0, dateIdx - 19), dateIdx + 1).filter((v) => !Number.isNaN(v));
    if (a.reduce((p, q) => p + q, 0) / 20 >= MIN_VAL) out.push(code);
  }
  return out;
}

async function scanDay(date: string, limit?: number) {
  const { dates } = getDaily();
  const i = dates.indexOf(date);
  if (i < 0) throw new Error(`data/daily 沒有 ${date}`);
  const codes = universe(i).slice(0, limit);
  const t0 = Date.now();
  const n: Record<string, string> = {};
  const h: Record<string, string> = {};
  const s: Record<string, (string | number)[]> = {};
  const queue = [...codes];
  let fail = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const g = await fetchZco(c, date);
      if (!g) { fail++; continue; }
      if (!g.rows.length) continue;
      Object.assign(n, g.names);
      Object.assign(h, g.bh);
      s[c] = [g.vol, ...g.rows.flat()];
    }
  }));
  const got = Object.keys(s).length;
  console.log(`分點 ${date}：${codes.length} 檔，有資料 ${got}，失敗 ${fail}，${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  if (limit) return;
  // 富邦還沒更新（或被擋）時大多是空的，不要存一個殘缺的檔
  if (got < codes.length * 0.8) throw new Error(`${date} 有資料的不到八成，先不存`);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/${date}.json`, JSON.stringify({ date, n, h, s }));
}

async function main() {
  const args = process.argv.slice(2);
  const { dates } = getDaily();
  const flag = (k: string) => { const j = args.indexOf(k); return j >= 0 ? Number(args[j + 1]) : 0; };
  if (flag("--test")) return scanDay(dates.at(-1)!, flag("--test"));
  const want = flag("--backfill") ? dates.slice(-flag("--backfill")) : [args.find((a) => /^\d{4}-\d\d-\d\d$/.test(a)) ?? dates.at(-1)!];
  for (const d of want) {
    if (want.length > 1 && existsSync(`${DIR}/${d}.json`)) continue;
    try { await scanDay(d); } catch (e) { console.error((e as Error).message); if (want.length === 1) process.exitCode = 1; }
  }
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort() : [];
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) unlinkSync(`${DIR}/${f}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
