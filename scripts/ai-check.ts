// AI 連線檢查（GitHub Actions 用）
// npm run ai-check            → 試連 5 次（每次間隔 30 秒），結果寫到 GITHUB_OUTPUT 的 ok=true/false；連不到也不算失敗，讓後面的資料步驟照跑
// npm run ai-check -- --wait  → 先試連 5 次，還是不通就每 30 分鐘再試一次，最多等 WAIT_HOURS 小時（預設 5）；通了 exit 0，放棄 exit 1
import { appendFileSync } from "node:fs";

const BASE = (process.env.IAI_BASE_URL || "https://www.iai.nkust.edu.tw/aihub/v1").replace(/\/$/, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(11, 16);

/** 只看主機連不連得上：有任何 HTTP 回應（含 401/404）就算通 */
async function probe(): Promise<string | null> {
  try {
    await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${process.env.IAI_API_KEY?.trim() ?? ""}` }, signal: AbortSignal.timeout(15_000) });
    return null;
  } catch (e) {
    const c = (e as { cause?: { code?: string } }).cause;
    return c?.code || (e as Error).message;
  }
}

async function tryTimes(n: number, gapMs: number): Promise<boolean> {
  for (let k = 1; k <= n; k++) {
    const err = await probe();
    if (!err) { console.log(`${now()} AI 連線正常（第 ${k} 次）`); return true; }
    console.log(`${now()} 第 ${k} 次連不到 AI：${err}`);
    if (k < n) await sleep(gapMs);
  }
  return false;
}

async function main() {
  const wait = process.argv.includes("--wait");
  let ok = await tryTimes(5, 30_000);
  if (!ok && wait) {
    const rounds = Math.floor((Number(process.env.WAIT_HOURS) || 5) * 2);
    for (let r = 1; r <= rounds && !ok; r++) {
      console.log(`等 30 分鐘後再試（${r}/${rounds}）`);
      await sleep(30 * 60_000);
      ok = await tryTimes(1, 0);
    }
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ok=${ok}\n`);
  if (!ok) console.log(wait ? "一直連不到 AI，放棄" : "連不到 AI：這次先跳過 AI 步驟，結束時會排 ai-retry 等 AI 恢復後重跑");
  if (wait && !ok) process.exit(1);
}

main();
