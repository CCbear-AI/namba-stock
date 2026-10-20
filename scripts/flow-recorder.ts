// 盤中資金流記錄器：09:00–13:30 每 30 秒抓一次全市場，累積各板塊主動買賣淨額
// 用法：npm run flow-recorder                 （正式：等到開盤、收盤後結束）
//       npm run flow-recorder -- --test 3      （測試：不管時間，跑 3 輪就結束）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { getQuotes, ch, type Quote } from "../lib/mis";
import { updateStock, makePoint, type StockFlow, type FlowDay } from "../lib/flow";
import { hasSupabase, saveFlowDayRemote } from "../lib/store";

type U = { c: string; n: string; m: "tse" | "otc"; ind: string; sh: number };
const universe: U[] = JSON.parse(readFileSync("data/universe.json", "utf8"));
const meta = new Map(universe.map((u) => [u.c, { ind: u.ind, sh: u.sh }]));
const chs = universe.map((u) => ch(u.m, u.c));

const args = process.argv.slice(2);
const testRounds = args.includes("--test") ? Number(args[args.indexOf("--test") + 1] ?? 3) : 0;
const INTERVAL = 30_000;

const tw = () => new Date(Date.now() + 8 * 3600e3); // 用 UTC 欄位表示台灣時間
const hms = (d: Date) => d.toISOString().slice(11, 19);
const minutes = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const date = tw().toISOString().slice(0, 10);
  const file = `data/flow/${date}.json`;
  mkdirSync("data/flow", { recursive: true });
  const day: FlowDay = existsSync(file) && !testRounds
    ? JSON.parse(readFileSync(file, "utf8"))
    : { date, points: [], stocks: {}, updated: 0 };
  const state = new Map<string, StockFlow>();
  console.log(`資金流記錄器 ${date}，${universe.length} 檔，Supabase：${hasSupabase ? "有" : "無（只存本機檔）"}`);

  if (!testRounds) {
    // 等到 09:00
    while (minutes(tw()) < 9 * 60) await sleep(10_000);
  }

  for (let round = 1; ; round++) {
    const now = tw();
    if (!testRounds && minutes(now) > 13 * 60 + 31) break;
    const started = Date.now();
    const list = await getQuotes(chs);
    // 假日：報價日期不是今天就結束
    if (round === 1 && list.length && !testRounds) {
      const d = new Date(list[0].time + 8 * 3600e3).toISOString().slice(0, 10);
      if (d !== date) { console.log(`今天沒開盤（報價日期 ${d}），結束`); return; }
    }
    const quotes = new Map<string, Quote>(list.map((q) => [q.c, q]));
    for (const q of list) state.set(q.c, updateStock(state.get(q.c), q));
    const { point, stocks } = makePoint(hms(now), state, quotes, meta);
    day.points.push(point);
    day.stocks = stocks;
    day.updated = Date.now();
    writeFileSync(file, JSON.stringify(day));
    if (hasSupabase) {
      try { await saveFlowDayRemote(day); } catch (e) { console.error("Supabase 寫入失敗", (e as Error).message); }
    }
    const total = Object.values(point.s).reduce((a, v) => a + v[0], 0);
    console.log(`${point.t} 第${round}輪 ${list.length}檔 ${Date.now() - started}ms 全市場淨額 ${total.toFixed(2)} 億`);
    if (testRounds && round >= testRounds) break;
    await sleep(Math.max(1000, INTERVAL - (Date.now() - started)));
  }
  console.log("結束，共", day.points.length, "筆");
}

main().catch((e) => { console.error(e); process.exit(1); });
