// 全市場個股體檢預先算：成交值大的前 N 檔＋有新聞重點的個股，燈號由程式算、AI 每 10 檔一批寫一句總結，
// 存到 data/checkup/latest.json，個股頁打開直接讀（不用等 AI）。月營收用證交所／櫃買開放資料一次抓全市場。
// 用法：npm run checkup-all [-- --top 400 | --no-ai]（world-focus workflow 早上跑，前一晚的融資券、分點、集保都齊了；同一天已寫好的不重問）
import fs from "node:fs";
import path from "node:path";
import { checkup, checkupAiBatch, type Checkup } from "@/lib/checkup";
import { CHECKUP_FILE, type CheckupAll } from "@/lib/checkupStore";
import { readDigests } from "@/lib/stockNews";
import { getDaily } from "@/lib/history";
import { aiReady, pool, withSplit, AI_PAR } from "@/lib/ai";
import { BY_CODE } from "@/lib/universe";
import { revenue } from "@/lib/revenue";

const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const TOP = arg("--top", 400);
const BATCH = 10;
const PAR = 4;

async function main() {
  const { dates, s } = getDaily();
  const date = dates.at(-1)!;
  // 近 20 日平均成交值排名（val 單位百萬）
  const avgVal = (c: string) => { const v = s.get(c)?.val.slice(-20) ?? []; return v.reduce((a, x) => a + (x || 0), 0) / (v.length || 1); };
  const ranked = [...BY_CODE.keys()].filter((c) => s.has(c)).sort((a, b) => avgVal(b) - avgVal(a));
  const digests = readDigests();
  const codes = [...new Set([...ranked.slice(0, TOP), ...Object.keys(digests).filter((c) => BY_CODE.has(c))])];

  const prev: CheckupAll | null = fs.existsSync(CHECKUP_FILE) ? JSON.parse(fs.readFileSync(CHECKUP_FILE, "utf8")) : null;
  const items: CheckupAll["items"] = {};
  const rev = await revenue();
  console.log(`盤後日 ${date}，體檢 ${codes.length} 檔，月營收 ${rev.size} 家`);

  let k = 0;
  const queue = [...codes];
  await Promise.all(Array.from({ length: PAR }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const x = await checkup(c, { rev, batch: true, digest: digests[c] ?? null }).catch((e: Error) => ({ error: e.message }));
      if (!("error" in x)) items[c] = x;
      if (++k % 100 === 0) console.log(`燈號 ${k}/${codes.length}`);
    }
  }));
  // 同一天、燈號沒變的沿用上次的 AI 總結（排程重跑不重問）
  const sig = (x: Checkup) => x.lights.map((l) => l.lv + l.text).join("|");
  for (const [c, x] of Object.entries(items)) {
    const p = prev?.items[c];
    if (p?.ai && p.date === x.date && sig(p) === sig(x)) x.ai = p.ai;
  }
  const out: CheckupAll = { date, generated: Date.now(), items };
  const save = () => { fs.mkdirSync(path.dirname(CHECKUP_FILE), { recursive: true }); fs.writeFileSync(CHECKUP_FILE, JSON.stringify(out)); };
  save();

  if (process.argv.includes("--no-ai") || !aiReady()) { console.log("只算燈號"); return; }
  const todo = codes.filter((c) => items[c] && !items[c].ai);
  console.log(`AI 總結 ${todo.length} 檔`);
  const batches = Array.from({ length: Math.ceil(todo.length / BATCH) }, (_, i) => todo.slice(i * BATCH, (i + 1) * BATCH));
  let done = 0, fail = 0, n = 0;
  await pool(batches, AI_PAR, async (b, bi) => {
    if (fail >= 6) return; // 連續失敗太多次，剩下的下次排程再補
    try {
      await withSplit(b, async (part) => {
        const m = await checkupAiBatch(part.map((c) => ({ x: items[c], name: BY_CODE.get(c)?.n ?? "" })));
        for (const [c, t] of m) { items[c].ai = t; done++; }
      });
      fail = 0;
    } catch (e) { fail++; console.log(`第 ${bi + 1} 批失敗：${(e as Error).message}`); }
    if (++n % 5 === 0) { save(); console.log(`AI ${done}/${todo.length}`); }
  });
  save();
  console.log(`AI 總結完成 ${done}／${todo.length} 檔`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
