// 集保股權分散表（每週五公布）：千張大戶、400 張以上大股東、50 張以下散戶持股比例與股東人數
// 用法：npm run tdcc     輸出 data/tdcc/資料日期.json  代號 → [千張大戶%, 股東人數, 400張以上%, 400張以上人數, 50張以下散戶%]，保留最近 26 週
// 集保開放資料只給最新一週，所以歷史要靠每週排程慢慢累積
// 持股分級：1~8＝50 張以下、12~15＝400 張以上、15＝1000 張以上、17＝合計
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync } from "node:fs";

const r2 = (x: number) => Math.round(x * 100) / 100;

async function main() {
  const r = await fetch("https://opendata.tdcc.com.tw/getOD.ashx?id=1-5", { headers: { "User-Agent": "Mozilla/5.0" } });
  const text = (await r.text()).replace(/^﻿/, "");
  const universe: { c: string }[] = JSON.parse(readFileSync("data/universe.json", "utf8"));
  const want = new Set([...universe.map((u) => u.c), "0050", "0056", "006208", "00878", "00919"]);
  // 代號 → 各分級 [人數, 股數, 比例]
  const raw: Record<string, Record<number, [number, number, number]>> = {};
  let date = "";
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [d, code, lv, people, shares, pct] = line.split(",").map((x) => x.trim());
    if (!code || !want.has(code)) continue;
    date = d;
    (raw[code] ??= {})[Number(lv)] = [Number(people), Number(shares), Number(pct)];
  }
  if (!date) throw new Error("集保資料是空的");
  const s: Record<string, number[]> = {};
  for (const [code, L] of Object.entries(raw)) {
    const total = L[17]?.[1] || 0;
    const sum = (a: number, b: number, k: 0 | 1) => { let t = 0; for (let i = a; i <= b; i++) t += L[i]?.[k] ?? 0; return t; };
    s[code] = [
      L[15]?.[2] ?? 0,
      L[17]?.[0] ?? 0,
      total ? r2((sum(12, 15, 1) / total) * 100) : 0,
      sum(12, 15, 0),
      total ? r2((sum(1, 8, 1) / total) * 100) : 0,
    ];
  }
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  mkdirSync("data/tdcc", { recursive: true });
  writeFileSync(`data/tdcc/${iso}.json`, JSON.stringify({ date: iso, s }));
  const files = readdirSync("data/tdcc").filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 26))) unlinkSync(`data/tdcc/${f}`);
  console.log("集保", iso, Object.keys(s).length, "檔", "2330", s["2330"]);
}

main().catch((e) => { console.error(e); process.exit(1); });
