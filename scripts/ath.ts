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
  for (const f of files.slice(0, -1)) applyDay(store, f);
  const prev = JSON.parse(JSON.stringify(store)); // 最後一天之前的版本：盤後檔案已含今天時，雷達要跟這個比
  if (files.length) applyDay(store, files[files.length - 1]);
  for (const r of [...Object.values(store), ...Object.values(prev) as Rec[]]) { r[0] = Math.round(r[0] * 100) / 100; r[2] = Math.round(r[2] * 100) / 100; }
  writeFileSync(FILE, JSON.stringify({ upTo: files.at(-1)?.slice(0, 10) ?? "", s: store, prev }));
  console.log("完成", Object.keys(store).length, "檔");
}

/** Yahoo 日 K（含興櫃時期）：[日期, 最高, 最低] */
async function yahooDaily(c: string, m: "tse" | "otc") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${c}.${m === "otc" ? "TWO" : "TW"}?range=max&interval=1d`;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) });
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(String(r.status));
      const res = (await r.json()).chart?.result?.[0];
      if (!res?.timestamp) return [];
      const q = res.indicators.quote[0];
      return (res.timestamp as number[]).map((t, i) => [new Date((t + 8 * 3600) * 1000).toISOString().slice(0, 10), q.high[i], q.low[i]] as [string, number | null, number | null]);
    } catch { await sleep(3000 * (k + 1)); }
  }
  return null;
}

/**
 * 新上市櫃／興櫃轉上市櫃的股票：建檔時還不在清單裡，紀錄只從進 data/daily 那天開始，
 * 會把上市後幾天的高點誤當歷史高點。用 Yahoo 日 K 把「進 data/daily 之前」的高低補上（只補一次，記在 bf）。
 */
async function backfill(s: Record<string, Rec>, prev: Record<string, Rec> | undefined, bf: string[]) {
  const files = dailyFiles();
  if (!files.length) return 0;
  const d0 = files[0].slice(0, 10), done = new Set(bf);
  // 高低點都落在日 K 期間內、又還沒補過的才需要查
  const cand = Object.entries(s).filter(([c, r]) => !done.has(c) && r[1] >= d0 && r[3] >= d0).map(([c]) => c);
  if (!cand.length) return 0;
  // 每檔第一次出現在 data/daily 的日期
  const first = new Map<string, string>(), want = new Set(cand);
  for (const f of files) {
    const day = JSON.parse(readFileSync(`data/daily/${f}`, "utf8")) as { date: string; s: Record<string, number[]> };
    for (const c of Object.keys(day.s)) if (want.has(c) && !first.has(c)) first.set(c, day.date);
    if (first.size === want.size) break;
  }
  // 從第一天就在的老股票不用補
  // ETF（00 開頭）不補：Yahoo 沒處理分割（0052 2025/11 一拆七前後價格直接接在一起）
  const todo = cand.filter((c) => !c.startsWith("00") && (first.get(c) ?? d0) > d0);
  const mk = new Map(universe.map((u) => [u.c, u.m]));
  let n = 0;
  for (const c of todo) {
    const bars = await yahooDaily(c, mk.get(c) ?? "tse");
    if (bars == null) continue; // 抓失敗下次再試
    const fd = first.get(c)!;
    for (const [d, h, l] of bars) {
      if (d >= fd || !h || !l || h <= 0 || l <= 0) continue;
      for (const st of [s, prev]) {
        const r = st?.[c];
        if (!r) continue;
        if (h > r[0]) { r[0] = Math.round(h * 100) / 100; r[1] = d; }
        if (l < r[2]) { r[2] = Math.round(l * 100) / 100; r[3] = d; }
      }
    }
    bf.push(c); n++;
    console.log(`補歷史 ${c}：最高 ${s[c][0]}（${s[c][1]}）最低 ${s[c][2]}（${s[c][3]}）`);
    await sleep(500);
  }
  // 從第一天就在的也記起來，下次不用再查
  for (const c of cand) if (!todo.includes(c)) bf.push(c);
  return n;
}

async function update() {
  if (!existsSync(FILE)) return full();
  const { upTo, s, prev: oldPrev, bf = [] } = JSON.parse(readFileSync(FILE, "utf8")) as { upTo: string; s: Record<string, Rec>; prev?: Record<string, Rec>; bf?: string[] };
  const files = dailyFiles().filter((f) => f.slice(0, 10) > upTo);
  let prev = oldPrev;
  if (files.length) {
    for (const f of files.slice(0, -1)) applyDay(s, f);
    prev = JSON.parse(JSON.stringify(s)); // 最後一天之前的版本
    applyDay(s, files[files.length - 1]);
  }
  const n = await backfill(s, prev, bf);
  if (!files.length && !n) return console.log("沒有新的日 K");
  writeFileSync(FILE, JSON.stringify({ upTo: dailyFiles().at(-1)?.slice(0, 10) ?? upTo, s, prev, bf }));
  console.log("更新", files.length, "天，補歷史", n, "檔");
}

(process.argv[2] === "update" ? update() : full()).catch((e) => { console.error(e); process.exit(1); });
