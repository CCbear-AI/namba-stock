// 修補某一天的資金流紀錄（記錄器晚開始、中途斷掉時用）
//   npm run flow-fix -- 2026-10-22 --yahoo --note "說明"
//     --yahoo：用 Yahoo 全天外盤／內盤量重算最後一筆（個股、產業、族群的淨額），只能在「Yahoo 還停在那一天」時跑（當天收盤後到下個交易日開盤前）
//     --note：頁面上顯示的說明
//   沒給 --yahoo／--note 就只上傳：有 SUPABASE_SERVICE_KEY 時把 data/flow/日期.json 寫進 Supabase（GitHub Actions flow-fix.yml 用）
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FlowDay } from "../lib/flow";
import { THEMES_OF } from "../lib/themes";
import { yahooInOut } from "../lib/yahooFlow";
import { hasSupabase, saveFlowDayRemote } from "../lib/store";

const args = process.argv.slice(2);
const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!date) throw new Error("要給日期，例如 2026-10-22");
const noteAt = args.indexOf("--note");
const note = noteAt >= 0 ? args[noteAt + 1] : undefined;
const file = path.join(process.cwd(), "data", "flow", `${date}.json`);
const day = JSON.parse(readFileSync(file, "utf8")) as FlowDay;
const yi = (v: number) => Math.round(v / 1e6) / 100;

async function main() {
  if (args.includes("--yahoo")) {
    const universe = JSON.parse(readFileSync("data/universe.json", "utf8")) as { c: string; m: "tse" | "otc"; ind: string }[];
    const list = universe.filter((u) => day.stocks[u.c]);
    const io = await yahooInOut(list);
    if (io.size < list.length * 0.9) throw new Error(`Yahoo 只抓到 ${io.size}/${list.length} 檔，先不改`);
    const last = day.points[day.points.length - 1];
    const s: Record<string, number> = {}, g: Record<string, number> = {};
    for (const u of list) {
      const y = io.get(u.c);
      // Yahoo 沒抓到的沿用原本的數字
      const net = y && y.avg ? (y.outL - y.inL) * 1000 * y.avg : day.stocks[u.c][0] * 1e8;
      day.stocks[u.c][0] = yi(net);
      s[u.ind] = (s[u.ind] ?? 0) + net;
      for (const t of THEMES_OF.get(u.c) ?? []) g[t] = (g[t] ?? 0) + net;
    }
    for (const k of Object.keys(last.s)) if (s[k] != null) last.s[k][0] = yi(s[k]);
    for (const k of Object.keys(last.g ?? {})) if (g[k] != null) last.g![k][0] = yi(g[k]);
    const total = Object.values(last.s).reduce((a, v) => a + v[0], 0);
    console.log(`${date} 收盤淨額改為 ${total.toFixed(1)} 億（Yahoo ${io.size}/${list.length} 檔）`);
  }
  if (note) day.note = note;
  if (args.includes("--yahoo") || note) {
    // updated 不動：改成現在的話頁面會誤以為是盤中即時
    writeFileSync(file, JSON.stringify(day));
    console.log("已寫入", file);
  }
  if (process.env.SUPABASE_SERVICE_KEY && hasSupabase) {
    await saveFlowDayRemote(day);
    console.log("已更新 Supabase");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
