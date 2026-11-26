// 一次性回補：把 400 張以上大股東比例與人數補進既有的 data/tdcc/日期.json（第 3、4 欄）
// 集保開放資料只有最新一週，歷史從神秘金字塔抓；它會擋雲端機房，所以要在自己電腦跑
// 用法：npx tsx scripts/tdcc-big400.ts     （每 2 秒一檔，約 1 小時；中斷後重跑會跳過已補過的）
// 50 張以下散戶% 神秘金字塔沒有，只能從新的一週開始累積
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { holderHistory } from "../lib/pyramid";

const DIR = "data/tdcc";
const DONE = "data/tdcc/_big400.json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const weeks = new Map<string, Record<string, number[]>>();
  for (const f of readdirSync(DIR).filter((x) => /^\d{4}-\d\d-\d\d\.json$/.test(x))) weeks.set(f.slice(0, 10), JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")).s);
  const codes = [...new Set([...weeks.values()].flatMap((m) => Object.keys(m)))].sort();
  const done = new Set<string>(existsSync(DONE) ? JSON.parse(readFileSync(DONE, "utf8")) : []);
  const flush = () => {
    for (const [d, s] of weeks) writeFileSync(`${DIR}/${d}.json`, JSON.stringify({ date: d, s }));
    writeFileSync(DONE, JSON.stringify([...done]));
  };
  let n = 0, fail = 0, filled = 0;
  for (const c of codes) {
    if (done.has(c)) continue;
    try {
      for (const w of await holderHistory(c)) {
        const row = weeks.get(w.date)?.[c];
        if (!row || row.length >= 3) continue; // 沒這週或已經有（集保官方算的優先）
        row[2] = w.big400;
        row[3] = w.n400;
        filled++;
      }
      done.add(c);
    } catch (e) {
      fail++;
      console.warn(c, (e as Error).message.slice(0, 80));
    }
    if (++n % 50 === 0) { flush(); console.log(`${n} / ${codes.length}（失敗 ${fail}，補了 ${filled} 筆）`); }
    await sleep(2000);
  }
  flush();
  console.log("完成", n, "檔，失敗", fail, "補了", filled, "筆");
}

main().catch((e) => { console.error(e); process.exit(1); });
