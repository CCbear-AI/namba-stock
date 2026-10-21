// 集保股權分散表（每週五公布）：千張大戶持股比例、股東人數
// 用法：npm run tdcc     輸出 data/tdcc/資料日期.json  代號 → [千張大戶%, 股東人數]，保留最近 26 週
// 集保開放資料只給最新一週，所以歷史要靠每週排程慢慢累積
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync } from "node:fs";

async function main() {
  const r = await fetch("https://opendata.tdcc.com.tw/getOD.ashx?id=1-5", { headers: { "User-Agent": "Mozilla/5.0" } });
  const text = (await r.text()).replace(/^﻿/, "");
  const universe: { c: string }[] = JSON.parse(readFileSync("data/universe.json", "utf8"));
  const want = new Set([...universe.map((u) => u.c), "0050", "0056", "006208", "00878", "00919"]);
  const s: Record<string, [number, number]> = {};
  let date = "";
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [d, code, lv, people, , pct] = line.split(",").map((x) => x.trim());
    if (!code || !want.has(code)) continue;
    date = d;
    const x = (s[code] ??= [0, 0]);
    if (lv === "15") x[0] = Number(pct);
    if (lv === "17") x[1] = Number(people);
  }
  if (!date) throw new Error("集保資料是空的");
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  mkdirSync("data/tdcc", { recursive: true });
  writeFileSync(`data/tdcc/${iso}.json`, JSON.stringify({ date: iso, s }));
  const files = readdirSync("data/tdcc").filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 26))) unlinkSync(`data/tdcc/${f}`);
  console.log("集保", iso, Object.keys(s).length, "檔");
}

main().catch((e) => { console.error(e); process.exit(1); });
