// 自選收盤報告推播：分點資料進來後（跟分點晚報同一時間），替每台裝置開的「自選收盤報告」提醒各推一則一句話重點，
// 點開到自選股頁看完整報告（AI 重點在網頁上寫）。同一天只推一次（記在 data/report/wlpush.json）
// 用法：npm run wl-push [-- --force]
import fs from "node:fs";
import path from "node:path";
import { getBrokerDays } from "@/lib/brokers";
import { getDaily } from "@/lib/history";
import { brief, wlFacts } from "@/lib/wlreport";
import { pushReady, pushPerRule } from "@/lib/pushServer";

const MARK = path.join(process.cwd(), "data", "report", "wlpush.json");
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

async function main() {
  const date = getBrokerDays().days.at(-1)?.date;
  const last = getDaily().dates.at(-1);
  if (!date || date !== last) { console.log(`分點資料 ${date ?? "沒有"}，最新交易日 ${last}，還沒到，略過`); return; }
  const done = fs.existsSync(MARK) ? (JSON.parse(fs.readFileSync(MARK, "utf8")) as { date: string }).date : "";
  if (done === date && !process.argv.includes("--force")) { console.log(`${date} 已經推過，略過`); return; }
  if (!pushReady) { console.log("沒有推播設定，略過"); return; }
  const sent = await pushPerRule("wlreport", (r) => {
    const codes = r.codes ?? [];
    if (!codes.length) return null;
    const x = wlFacts(codes);
    if ("error" in x || !x.rows.length) return null;
    const name = r.label ?? "自選股";
    return { title: `自選收盤報告 ${md(date)}`, body: brief(x, name), url: `/watchlist${r.scope ? `?g=${encodeURIComponent(r.scope)}` : ""}`, tag: `wl${date}${r.id}` };
  });
  console.log(`自選收盤報告推播 ${sent} 則`);
  fs.mkdirSync(path.dirname(MARK), { recursive: true });
  fs.writeFileSync(MARK, JSON.stringify({ date, sent }));
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
