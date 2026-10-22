// 盤後資料：全市場日 K、法人籌碼、融資融券、外資持股、借券、當沖、上櫃類股指數
// 用法：npm run market-history                    （補最近 14 天沒抓過的）
//       npm run market-history -- 2025-09-01        （日 K 從這天回補；籌碼固定只補最近 70 個交易日）
// 輸出：data/daily/日期.json、data/chips/日期.json、data/sector-otc.json
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { ETFS } from "../lib/etfs";

type Json = Record<string, unknown> & { stat?: string; tables?: { title?: string; fields?: string[]; data?: string[][] }[]; fields?: string[]; data?: string[][] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (s: unknown) => {
  const v = Number(String(s ?? "").replace(/,/g, "").replace(/<[^>]+>/g, "").trim());
  return Number.isFinite(v) ? v : 0;
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const roc = (date: string) => date.replace(/-/g, "/"); // 櫃買新版網址用西元 yyyy/mm/dd

// 證交所限速比較嚴：每次請求間隔 3.5 秒；櫃買 1.2 秒
const lastHit: Record<string, number> = {};
async function getJson(url: string, gap: number): Promise<Json | null> {
  const host = new URL(url).host;
  for (let k = 0; k < 4; k++) {
    const wait = (lastHit[host] ?? 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit[host] = Date.now();
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const t = await r.text();
      if (t.startsWith("<")) throw new Error("被擋或回 HTML");
      return JSON.parse(t.replace(/^﻿/, ""));
    } catch (e) {
      console.warn(`  重試 ${k + 1}：${url.slice(0, 90)} ${(e as Error).message}`);
      await sleep(8000 * (k + 1));
    }
  }
  return null;
}
const twse = (path: string) => getJson(`https://www.twse.com.tw/rwd/zh/${path}&response=json`, 3500);
const tpex = (path: string) => getJson(`https://www.tpex.org.tw/www/zh-tw/${path}&response=json`, 1200);

function table(j: Json | null, first: string) {
  if (!j) return null;
  if (j.fields?.[0]?.includes(first)) return j.data ?? [];
  return j.tables?.find((t) => t.fields?.[0]?.includes(first))?.data ?? null;
}

const universe: { c: string; m: "tse" | "otc" }[] = JSON.parse(readFileSync("data/universe.json", "utf8"));
const CODES = new Set([...universe.map((u) => u.c), ...Object.keys(ETFS)]);

/** 日 K：代號 → [開, 高, 低, 收, 量(張), 金額(百萬)] */
async function daily(date: string) {
  const d8 = date.replace(/-/g, "");
  const out: Record<string, number[]> = {};
  const a = table(await twse(`afterTrading/MI_INDEX?date=${d8}&type=ALLBUT0999`), "證券代號");
  if (!a?.length) return null; // 休市
  for (const r of a) {
    if (!CODES.has(r[0])) continue;
    const c = num(r[8]);
    if (!c) continue;
    out[r[0]] = [num(r[5]), num(r[6]), num(r[7]), c, Math.round(num(r[2]) / 1000), Math.round(num(r[4]) / 1e4) / 100];
  }
  const b = table(await tpex(`afterTrading/dailyQuotes?date=${roc(date)}`), "代號");
  for (const r of b ?? []) {
    if (!CODES.has(r[0])) continue;
    const c = num(r[2]);
    if (!c) continue;
    out[r[0]] = [num(r[4]) || c, num(r[5]) || c, num(r[6]) || c, c, Math.round(num(r[8]) / 1000), Math.round(num(r[9]) / 1e4) / 100];
  }
  return out;
}

/**
 * 籌碼：代號 → [外資, 投信, 自營商（張）, 融資餘額, 融券餘額（張）, 融資限額（張）, 外資持股%, 借券賣出餘額（張）, 當沖%]
 * m：大盤（上市）三大法人金額（億）與融資融券
 */
async function chips(date: string, dayRows: Record<string, number[]>) {
  const d8 = date.replace(/-/g, "");
  const s: Record<string, number[]> = {};
  const row = (c: string) => (s[c] ??= [0, 0, 0, 0, 0, 0, -1, -1, -1]);
  const lots = (v: unknown) => Math.round(num(v) / 1000);

  const t86 = table(await twse(`fund/T86?date=${d8}&selectType=ALLBUT0999`), "證券代號");
  if (!t86) return null;
  for (const r of t86) if (CODES.has(r[0])) { const x = row(r[0]); x[0] = lots(r[4]); x[1] = lots(r[10]); x[2] = lots(r[11]); }
  const ti = table(await tpex(`insti/dailyTrade?type=Daily&sect=EW&date=${roc(date)}`), "代號");
  for (const r of ti ?? []) if (CODES.has(r[0])) { const x = row(r[0]); x[0] = lots(r[4]); x[1] = lots(r[13]); x[2] = lots(r[22]); }

  const mg = await twse(`marginTrading/MI_MARGN?date=${d8}&selectType=ALL`);
  for (const r of table(mg, "代號") ?? []) if (CODES.has(r[0])) { const x = row(r[0]); x[3] = num(r[6]); x[4] = num(r[12]); x[5] = num(r[7]); }
  const tm = table(await tpex(`margin/balance?date=${roc(date)}`), "代號");
  for (const r of tm ?? []) if (CODES.has(r[0])) { const x = row(r[0]); x[3] = num(r[6]); x[4] = num(r[14]); x[5] = num(r[9]); }

  for (const r of table(await twse(`fund/MI_QFIIS?date=${d8}&selectType=ALLBUT0999`), "證券代號") ?? []) if (CODES.has(r[0])) row(r[0])[6] = num(r[7]);
  for (const r of table(await twse(`marginTrading/TWT93U?date=${d8}`), "代號") ?? []) if (CODES.has(r[0])) row(r[0])[7] = lots(r[12]);
  for (const r of table(await twse(`dayTrading/TWTB4U?date=${d8}&selectType=All`), "證券代號") ?? []) {
    if (!CODES.has(r[0])) continue;
    const vol = dayRows[r[0]]?.[4];
    if (vol) row(r[0])[8] = Math.round((lots(r[3]) / vol) * 1000) / 10;
  }

  // 大盤三大法人金額（億）：外資(不含外資自營商)+外資自營商、投信、自營商自行、自營商避險
  const m: Record<string, number> = {};
  const bfi = await twse(`fund/BFI82U?type=day&dayDate=${d8}`);
  for (const r of bfi?.data ?? []) {
    const net = Math.round(num(r[3]) / 1e6) / 100;
    if (r[0].startsWith("自營商(自行")) m.dSelf = net;
    else if (r[0].startsWith("自營商(避險")) m.dHedge = net;
    else if (r[0] === "投信") m.t = net;
    else if (r[0].startsWith("外資及陸資")) m.f = (m.f ?? 0) + net;
    else if (r[0] === "外資自營商") m.f = (m.f ?? 0) + net;
  }
  m.d = Math.round(((m.dSelf ?? 0) + (m.dHedge ?? 0)) * 100) / 100;
  m.f = Math.round((m.f ?? 0) * 100) / 100;
  const tot = mg?.tables?.[0]?.data ?? [];
  for (const r of tot) {
    if (r[0].startsWith("融資(交易單位")) m.marginLots = num(r[5]);
    if (r[0].startsWith("融券(交易單位")) m.shortLots = num(r[5]);
    if (r[0].startsWith("融資金額")) m.marginAmt = Math.round(num(r[5]) / 1e3) / 100; // 仟元 → 億
  }
  return { s, m };
}

/** 上櫃類股指數日 K（櫃買 sectinx） */
async function otcSectors(date: string, store: { bars: Record<string, [string, number, number, number, number][]> }) {
  const t = table(await tpex(`indexInfo/sectinx?date=${roc(date)}`), "名稱");
  if (!t?.length) return false;
  for (const r of t) {
    const c = num(r[1]);
    if (!c) continue;
    const arr = (store.bars[r[0]] ??= []);
    if (!arr.some((b) => b[0] === date)) arr.push([date, num(r[3]) || c, num(r[4]) || c, num(r[5]) || c, c]);
  }
  return true;
}

async function main() {
  for (const d of ["data/daily", "data/chips"]) mkdirSync(d, { recursive: true });
  const NODATA = "data/daily/_nodata.json";
  const noData = new Set<string>(existsSync(NODATA) ? JSON.parse(readFileSync(NODATA, "utf8")) : []);
  const otcFile = "data/sector-otc.json";
  const otc = existsSync(otcFile) ? JSON.parse(readFileSync(otcFile, "utf8")) : { bars: {} };
  const otcDone = new Set<string>();
  for (const arr of Object.values(otc.bars) as [string][][]) for (const b of arr) otcDone.add(b[0]);

  const now = new Date(Date.now() + 8 * 3600e3);
  const today = ymd(now);
  // 收盤資料約 15:00 後才齊，之前不抓今天
  const last = now.getUTCHours() * 60 + now.getUTCMinutes() >= 15 * 60 + 30 ? today : ymd(new Date(now.getTime() - 864e5));
  const start = process.argv[2] ?? ymd(new Date(now.getTime() - 14 * 864e5));
  const days: string[] = [];
  for (let d = new Date(start); ymd(d) <= last; d = new Date(d.getTime() + 864e5)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !noData.has(ymd(d))) days.push(ymd(d));
  }
  const have = new Set(readdirSync("data/daily").map((f) => f.slice(0, 10)));
  // 融資券約 21:00 才公布、法人金額偶爾會修正：缺融資券的檔案、以及最近一個交易日，每次都重抓
  const latest = [...have].filter((d) => /^\d{4}-/.test(d)).sort().pop();
  const haveChips = new Set(
    readdirSync("data/chips")
      .filter((f) => f.endsWith(".json"))
      .filter((f) => f.slice(0, 10) !== latest && JSON.parse(readFileSync(`data/chips/${f}`, "utf8")).m?.marginLots)
      .map((f) => f.slice(0, 10)),
  );
  // 籌碼只留最近 70 個交易日
  const tradingDays = [...new Set([...have, ...days])].filter((d) => !noData.has(d) && /^\d{4}-/.test(d)).sort();
  const chipFrom = tradingDays[Math.max(0, tradingDays.length - 70)] ?? start;

  for (const date of days) {
    let rows: Record<string, number[]> | null = null;
    if (!have.has(date)) {
      rows = await daily(date);
      if (!rows) {
        if (date !== today) { noData.add(date); writeFileSync(NODATA, JSON.stringify([...noData].sort())); }
        console.log(date, "休市");
        continue;
      }
      writeFileSync(`data/daily/${date}.json`, JSON.stringify({ date, s: rows }));
      console.log(date, "日K", Object.keys(rows).length, "檔");
    }
    if (date >= chipFrom && !haveChips.has(date)) {
      rows ??= JSON.parse(readFileSync(`data/daily/${date}.json`, "utf8")).s;
      const c = await chips(date, rows!);
      if (c) { writeFileSync(`data/chips/${date}.json`, JSON.stringify({ date, ...c })); console.log(date, "籌碼", Object.keys(c.s).length, "檔"); }
    }
  }
  // 上櫃類股指數：第一次從 2024-10-01 回補，之後只補最近的
  const otcStart = otcDone.size ? start : "2024-10-01";
  let n = 0;
  for (let d = new Date(otcStart); ymd(d) <= last; d = new Date(d.getTime() + 864e5)) {
    const date = ymd(d), wd = d.getUTCDay();
    if (wd === 0 || wd === 6 || noData.has(date) || otcDone.has(date)) continue;
    if (await otcSectors(date, otc)) {
      otcDone.add(date);
      if (++n % 20 === 0) console.log(date, "上櫃類股");
    }
  }
  for (const k of Object.keys(otc.bars)) otc.bars[k].sort((a: [string], b: [string]) => a[0].localeCompare(b[0]));
  writeFileSync(otcFile, JSON.stringify(otc));
  // 籌碼檔超過 70 個交易日的刪掉舊的，避免 repo 一直變大
  const chipFiles = readdirSync("data/chips").filter((f) => f.endsWith(".json")).sort();
  for (const f of chipFiles.slice(0, Math.max(0, chipFiles.length - 70))) {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(`data/chips/${f}`);
  }
  console.log("完成");
}

main().catch((e) => { console.error(e); process.exit(1); });
