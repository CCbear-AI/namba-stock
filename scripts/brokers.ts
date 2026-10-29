// 分點進出：每天掃一次「成交值夠的股票」各自買超前 15、賣超前 15 的券商分點（富邦 DJ 公開頁，非正式 API）
// 用法：npm run brokers                 掃 data/daily 最新一天
//       npm run brokers -- 2026-10-28    掃指定日期
//       npm run brokers -- --backfill 60 補最近 60 個交易日裡還沒有的日子
//       npm run brokers -- --test 30     只抓 30 檔看速度、不存檔
// 輸出 data/brokers/日期.json：{ date, n: {分點代號: 名稱}, s: {股票: [推算成交量(張), 分點, 買進, 賣出, 分點, 買進, 賣出, ...]} }
// 只保留最近 KEEP 個交易日
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { getDaily } from "../lib/history";

const DIR = "data/brokers";
const KEEP = 70;
const MIN_VAL = 10; // 近 20 日平均成交值（百萬）至少 1,000 萬才掃，約 1,000 檔（不含 ETF）
const WORKERS = 6;
const num = (s: string) => Number(s.replace(/[,%]/g, "")) || 0;

type Row = [id: string, buy: number, sell: number];
type Got = { vol: number; rows: Row[]; names: Record<string, string> };

async function fetchOne(code: string, date: string): Promise<Got | null> {
  const url = `https://fubon-ebrokerdj.fbs.com.tw/z/zc/zco/zco.djhtm?a=${code}&e=${date}&f=${date}`;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return parse(new TextDecoder("big5").decode(await r.arrayBuffer()));
    } catch {
      await new Promise((ok) => setTimeout(ok, 1000 * (k + 1)));
    }
  }
  return null;
}

function parse(html: string): Got {
  const rows: Row[] = [];
  const names: Record<string, string> = {};
  let absSum = 0, pctSum = 0;
  for (const tr of html.split(/<tr[^>]*>/i)) {
    // 一列：買超券商, 買進, 賣出, 買超, 佔比, 賣超券商, 買進, 賣出, 賣超, 佔比
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length !== 10) continue;
    for (const o of [0, 5]) {
      const id = tds[o].match(/[?&]b=([^&"]+)/)?.[1];
      if (!id) continue;
      const txt = (i: number) => tds[o + i].replace(/<[^>]+>/g, "").trim();
      names[id] = txt(0);
      rows.push([id, num(txt(1)), num(txt(2))]);
      absSum += Math.abs(num(txt(3)));
      pctSum += num(txt(4));
    }
  }
  // 成交量用分點頁自己的「佔成交比」反推（跟 /api/branch 一樣）
  return { vol: pctSum ? Math.round((absSum / pctSum) * 100) : 0, rows, names };
}

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
  const s: Record<string, (string | number)[]> = {};
  const queue = [...codes];
  let fail = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const g = await fetchOne(c, date);
      if (!g) { fail++; continue; }
      if (!g.rows.length) continue;
      Object.assign(n, g.names);
      s[c] = [g.vol, ...g.rows.flat()];
    }
  }));
  const got = Object.keys(s).length;
  console.log(`分點 ${date}：${codes.length} 檔，有資料 ${got}，失敗 ${fail}，${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  if (limit) return;
  // 富邦還沒更新（或被擋）時大多是空的，不要存一個殘缺的檔
  if (got < codes.length * 0.8) throw new Error(`${date} 有資料的不到八成，先不存`);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/${date}.json`, JSON.stringify({ date, n, s }));
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
