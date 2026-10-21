// 上市櫃以來最高價／最低價（未還原權值），給破頂雷達用
// 用法：npm run ath          第一次：Yahoo 月 K 全抓（約 2000 檔，幾分鐘）
//       npm run ath -- update  之後每天：只用 data/daily 最新一天更新
// 輸出：data/ath.json  代號 → [最高價, 最高日期, 最低價, 最低日期]（只算到「昨天收盤」為止，盤中比對才有意義）
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";

type Rec = [number, string, number, string];
const FILE = "data/ath.json";
const universe: { c: string; m: "tse" | "otc" }[] = JSON.parse(readFileSync("data/universe.json", "utf8"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dailyFiles = () => readdirSync("data/daily").filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort();

function applyDay(store: Record<string, Rec>, file: string) {
  const { date, s } = JSON.parse(readFileSync(`data/daily/${file}`, "utf8")) as { date: string; s: Record<string, number[]> };
  for (const [c, [, h, l]] of Object.entries(s)) {
    if (!h || !l) continue;
    const r = store[c];
    if (!r) { store[c] = [h, date, l, date]; continue; }
    if (h > r[0]) { r[0] = h; r[1] = date; }
    if (l < r[2]) { r[2] = l; r[3] = date; }
  }
}

async function yahooMonthly(c: string, m: "tse" | "otc") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${c}.${m === "otc" ? "TWO" : "TW"}?range=max&interval=1mo`;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const res = j.chart?.result?.[0];
      if (!res?.timestamp) return null;
      const q = res.indicators.quote[0];
      return (res.timestamp as number[]).map((t, i) => ({ month: new Date((t + 8 * 3600) * 1000).toISOString().slice(0, 7), h: q.high[i] as number | null, l: q.low[i] as number | null }));
    } catch { await sleep(3000 * (k + 1)); }
  }
  return null;
}

async function full() {
  const files = dailyFiles();
  const firstMonth = files[0]?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const store: Record<string, Rec> = {};
  let i = 0;
  // 4 個同時抓
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < universe.length) {
      const u = universe[i++];
      const bars = await yahooMonthly(u.c, u.m);
      // 有 data/daily 的月份改用日 K（比較準，而且不會含到今天盤中）
      for (const b of bars ?? []) {
        if (b.month >= firstMonth || b.h == null || b.l == null || b.h <= 0 || b.l <= 0) continue;
        const r = store[u.c];
        const d = `${b.month}-01`;
        if (!r) store[u.c] = [b.h, d, b.l, d];
        else { if (b.h > r[0]) { r[0] = b.h; r[1] = d; } if (b.l < r[2]) { r[2] = b.l; r[3] = d; } }
      }
      if (i % 200 === 0) console.log(`${i} / ${universe.length}`);
    }
  }));
  for (const f of files) applyDay(store, f);
  for (const r of Object.values(store)) { r[0] = Math.round(r[0] * 100) / 100; r[2] = Math.round(r[2] * 100) / 100; }
  writeFileSync(FILE, JSON.stringify({ upTo: files.at(-1)?.slice(0, 10) ?? "", s: store }));
  console.log("完成", Object.keys(store).length, "檔");
}

function update() {
  if (!existsSync(FILE)) return full();
  const { upTo, s } = JSON.parse(readFileSync(FILE, "utf8")) as { upTo: string; s: Record<string, Rec> };
  const files = dailyFiles().filter((f) => f.slice(0, 10) > upTo);
  for (const f of files) applyDay(s, f);
  writeFileSync(FILE, JSON.stringify({ upTo: dailyFiles().at(-1)?.slice(0, 10) ?? upTo, s }));
  console.log("更新", files.length, "天");
}

(process.argv[2] === "update" ? Promise.resolve(update()) : full()).catch((e) => { console.error(e); process.exit(1); });
