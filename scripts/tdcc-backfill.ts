// 一次性回補：從神秘金字塔抓每檔近 26 週的千張大戶與股東人數，寫進 data/tdcc/日期.json
// 神秘金字塔會擋雲端機房（Vercel、GitHub Actions），所以要在自己電腦跑；之後每週由 npm run tdcc 接著累積
// 用法：npm run tdcc-backfill          （每 2 秒一檔，約 1 小時；中斷後重跑會跳過已抓過的）
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { holderHistory } from "../lib/pyramid";
import { ETFS } from "../lib/etfs";

const WEEKS = 26;
const DIR = "data/tdcc";
const DONE = "data/tdcc/_backfilled.json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(DIR, { recursive: true });
  const universe: { c: string }[] = JSON.parse(readFileSync("data/universe.json", "utf8"));
  const codes = [...universe.map((u) => u.c), ...Object.keys(ETFS)];
  const done = new Set<string>(existsSync(DONE) ? JSON.parse(readFileSync(DONE, "utf8")) : []);
  // 既有的每週檔
  const weeks = new Map<string, Record<string, [number, number]>>();
  for (const f of readdirSync(DIR).filter((x) => /^\d{4}-\d\d-\d\d\.json$/.test(x))) weeks.set(f.slice(0, 10), JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")).s);
  const flush = () => {
    const keep = [...weeks.keys()].sort().slice(-WEEKS);
    for (const d of keep) writeFileSync(`${DIR}/${d}.json`, JSON.stringify({ date: d, s: weeks.get(d) }));
    writeFileSync(DONE, JSON.stringify([...done]));
  };
  let n = 0, fail = 0;
  for (const c of codes) {
    if (done.has(c)) continue;
    try {
      const h = (await holderHistory(c)).slice(-WEEKS);
      for (const w of h) {
        const m = weeks.get(w.date) ?? {};
        m[c] ??= [w.big, w.holders];
        weeks.set(w.date, m);
      }
      done.add(c);
    } catch (e) {
      fail++;
      console.warn(c, (e as Error).message.slice(0, 80));
    }
    if (++n % 50 === 0) { flush(); console.log(`${n} / ${codes.length}（失敗 ${fail}）`); }
    await sleep(2000);
  }
  flush();
  console.log("完成", n, "檔，失敗", fail);
}

main().catch((e) => { console.error(e); process.exit(1); });
