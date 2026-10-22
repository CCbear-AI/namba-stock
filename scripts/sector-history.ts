// 上市類股指數日 K：用證交所 MI_5MINS_INDEX（每 5 秒指數）算出每天開高低收
// 用法：npm run sector-history            （補到今天，已有的日期跳過）
//       npm run sector-history -- 2024-10-01 （從指定日期開始回補）
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const FILE = "data/sector-tse.json";
type Store = { bars: Record<string, [string, number, number, number, number][]>; noData: string[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (s: string) => Number(String(s).replace(/,/g, ""));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function load(): Store {
  if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, "utf8"));
  return { bars: {}, noData: [] };
}
function save(s: Store) {
  for (const k of Object.keys(s.bars)) s.bars[k].sort((a, b) => a[0].localeCompare(b[0]));
  mkdirSync("data", { recursive: true });
  writeFileSync(FILE, JSON.stringify(s));
}

async function fetchDay(date: string) {
  const url = `https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_INDEX?date=${date.replace(/-/g, "")}&response=json`;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const j = await r.json();
      return j as { stat: string; fields?: string[]; data?: string[][] };
    } catch {
      await sleep(5000 * (k + 1));
    }
  }
  throw new Error(`抓不到 ${date}`);
}

async function main() {
  const s = load();
  const done = new Set<string>(s.noData);
  for (const arr of Object.values(s.bars)) for (const b of arr) done.add(b[0]);
  const start = new Date(process.argv[2] ?? (Object.keys(s.bars).length ? ymd(new Date(Date.now() - 14 * 864e5)) : "2024-10-01"));
  const today = new Date(Date.now() + 8 * 3600e3); // 台灣時間
  let n = 0;
  for (let d = new Date(start); d <= today; d = new Date(d.getTime() + 864e5)) {
    const date = ymd(d);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6 || done.has(date)) continue;
    const j = await fetchDay(date);
    if (j.stat !== "OK" || !j.data?.length || !j.fields) {
      // 今天還沒收盤的話不要記成沒資料
      if (date !== ymd(today)) s.noData.push(date);
    } else {
      const rows = j.data.slice(1); // 第一列 09:00:00 是昨收
      j.fields.slice(1).forEach((name, i) => {
        const vals = rows.map((r) => num(r[i + 1])).filter((v) => v > 0);
        if (!vals.length) return;
        (s.bars[name] ??= []).push([date, vals[0], Math.max(...vals), Math.min(...vals), vals[vals.length - 1]]);
      });
      console.log(date, "ok");
    }
    if (++n % 10 === 0) save(s);
    await sleep(2500);
  }
  save(s);
  console.log("完成，指數數量", Object.keys(s.bars).length);
  await marketVolume();
}

// 大盤每日成交量（張）與成交金額（億）：證交所 FMTQIK，一次一個月；第一次從 2024-10 回補，之後只補最近兩個月
const VOL_FILE = "data/taiex-vol.json";
async function marketVolume() {
  const v: Record<string, [number, number]> = existsSync(VOL_FILE) ? JSON.parse(readFileSync(VOL_FILE, "utf8")) : {};
  const now = new Date(Date.now() + 8 * 3600e3);
  const first = Object.keys(v).length ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)) : new Date("2024-10-01");
  for (let d = first; d <= now; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const r = await fetch(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${ymd(d).replace(/-/g, "")}&response=json`, { headers: { "User-Agent": "Mozilla/5.0" } });
    const j = (await r.json()) as { data?: string[][] };
    for (const row of j.data ?? []) {
      const [y, m, dd] = row[0].split("/").map(Number);
      v[`${y + 1911}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`] = [Math.round(num(row[1]) / 1000), Math.round(num(row[2]) / 1e6) / 100];
    }
    await sleep(2500);
  }
  writeFileSync(VOL_FILE, JSON.stringify(Object.fromEntries(Object.entries(v).sort())));
  console.log("大盤成交量", Object.keys(v).length, "天");
}

main().catch((e) => { console.error(e); process.exit(1); });
