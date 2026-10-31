// 個股新聞：抓鉅亨網台股新聞（公開 API，每則標好相關個股）存到 data/stocknews/發布日期.json，
// 有新消息的個股交給學校 AI 寫「近一週重點」（新聞＋重大訊息），存到 data/stocknews/digest.json。
// 用法：npm run stock-news [-- --no-ai 只抓不寫重點]（world-focus workflow 早上 07:00 跑；寫不完的下次補）
import fs from "node:fs";
import path from "node:path";
import { SNEWS_DIR, DIGEST_FILE, snewsDates, readSnewsDay, readDigests, type SNews, type Digest } from "@/lib/stockNews";
import { newsFor } from "@/lib/news";
import { aiReady, chat, parseJson, pool, withSplit, AI_PAR } from "@/lib/ai";
import { BY_CODE } from "@/lib/universe";
import { ETFS } from "@/lib/etfs";

const BATCH = 6;
const MAX_AI = 200; // 一次最多寫幾檔（新聞多的先寫）
const KEEP_DAYS = 70;
const tw = (t: number) => new Date(t + 8 * 3600e3).toISOString();
// 制式快訊：盤中速報不收；Factset 目標價收進清單但不給 AI（量多又沒內容）
const SKIP = /^盤中速報/;
const NOISE = /^鉅亨速報/;
const clean = (s: string) => String(s ?? "").replace(/&#10;|\n/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const known = (c: string) => BY_CODE.has(c) || c in ETFS;

async function fetchSince(since: number): Promise<SNews[]> {
  const out: SNews[] = [];
  for (let page = 1; page <= 25; page++) {
    const r = await fetch(`https://api.cnyes.com/media/api/v1/newslist/category/tw_stock?limit=30&page=${page}`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`鉅亨網 ${r.status}`);
    const items: { newsId: number; title: string; summary?: string; publishAt: number; stock?: (string | { code: string })[] }[] = (await r.json()).items?.data ?? [];
    if (!items.length) break;
    for (const x of items) {
      if (x.publishAt * 1000 < since) return out;
      const c = [...new Set((x.stock ?? []).map((s) => String(typeof s === "string" ? s : s.code)).filter(known))];
      if (!c.length || SKIP.test(x.title.trim())) continue;
      out.push({ id: x.newsId, t: clean(x.title), s: clean(x.summary ?? "").slice(0, 160), at: x.publishAt * 1000, c });
    }
  }
  return out;
}

const SYSTEM = `你是台股新聞編輯。使用者會給你幾檔股票，每檔附上近一週的新聞（[新聞編號] 標題｜摘要）與公司重大訊息。
請替每檔寫一句「近一週重點」給散戶看。
規則：
- 只用提供的內容，不要捏造事件、數字或原因，不要推測股價走勢，不要給買賣建議。
- text 60 字內：最重要的 1～2 件事（營收獲利、法說展望、訂單合作、擴產、處分資產、法人調整目標價等），寫出關鍵數字。不用重複公司名稱。
- 新聞若只是順帶提到這檔、跟它本身無關，就略過那則；全部無關時 text 寫空字串。
- tone 是對這檔的可能影響：「多」偏正面、「空」偏負面、「中」不明確或好壞參半。
- src 填根據的新聞編號（重大訊息不用填）。
只輸出 JSON：{"items":[{"c":"代號","text":"重點","tone":"多","src":[新聞編號]}]}`;

async function main() {
  fs.mkdirSync(SNEWS_DIR, { recursive: true });
  const dg0 = fs.existsSync(DIGEST_FILE) ? JSON.parse(fs.readFileSync(DIGEST_FILE, "utf8")) : {};
  const now = Date.now();
  // 從上次抓到的時間往回多抓 2 小時（鉅亨偶爾晚上架），第一次抓 4 天
  const since = dg0.fetched ? Math.max(dg0.fetched - 2 * 3600e3, now - 7 * 86400e3) : now - 4 * 86400e3;
  const fresh = await fetchSince(since);

  const days = new Map<string, SNews[]>();
  const day = (d: string) => { if (!days.has(d)) days.set(d, readSnewsDay(d)); return days.get(d)!; };
  const changed = new Map<string, number>(); // 代號 → 新增幾則
  for (const x of fresh) {
    const list = day(tw(x.at).slice(0, 10));
    if (list.some((y) => y.id === x.id)) continue;
    list.push(x);
    if (!NOISE.test(x.t)) for (const c of x.c) changed.set(c, (changed.get(c) ?? 0) + 1);
  }
  for (const [d, list] of days) fs.writeFileSync(path.join(SNEWS_DIR, `${d}.json`), JSON.stringify(list.sort((a, b) => b.at - a.at)));
  const old = snewsDates().slice(0, -KEEP_DAYS);
  for (const d of old) fs.rmSync(path.join(SNEWS_DIR, `${d}.json`));
  console.log(`抓到 ${fresh.length} 則（${tw(since).slice(5, 16)} 之後），有新消息 ${changed.size} 檔`);

  const items: Record<string, Digest> = readDigests();
  // 上次沒寫完的（pending）也一起補
  const todo = [...new Set([...(dg0.pending ?? []), ...[...changed].sort((a, b) => b[1] - a[1]).map(([c]) => c)])];
  const save = (pending: string[]) => {
    const cut = tw(now - 30 * 86400e3).slice(0, 10);
    for (const [c, x] of Object.entries(items)) if (x.d < cut) delete items[c];
    fs.writeFileSync(DIGEST_FILE, JSON.stringify({ fetched: now, pending, items }));
  };
  if (process.argv.includes("--no-ai") || !aiReady()) { save(todo); console.log("不寫重點，待寫", todo.length, "檔"); return; }

  const week = now - 7 * 86400e3;
  const weekNews = snewsDates().slice(-8).flatMap(readSnewsDay).filter((x) => x.at >= week && !NOISE.test(x.t));
  const sinceDay = tw(week).slice(0, 10);
  const run = todo.slice(0, MAX_AI);
  const batches = Array.from({ length: Math.ceil(run.length / BATCH) }, (_, i) => run.slice(i * BATCH, (i + 1) * BATCH));
  const left = new Set(todo); // 還沒寫好的，存檔時記成 pending 下次補
  let done = 0, fail = 0, n = 0;
  const digestBatch = async (batch: string[]) => {
    const ids = new Map<string, Set<number>>();
    const text = batch.map((c) => {
      const ns = weekNews.filter((x) => x.c.includes(c)).sort((a, b) => b.at - a.at).slice(0, 8);
      ids.set(c, new Set(ns.map((x) => x.id)));
      const ann = newsFor([c], sinceDay).filter((x) => (x.imp ?? 2) >= 2).slice(0, 5);
      return [`## ${c} ${BY_CODE.get(c)?.n ?? ETFS[c] ?? ""}`,
        ...ns.map((x) => `[${x.id}] ${tw(x.at).slice(5, 10)} ${x.t}${x.s ? `｜${x.s}` : ""}`),
        ...ann.map((x) => `重大訊息 ${x.d.slice(5)} ${x.sum || x.title}`)].join("\n");
    }).join("\n\n");
    const j = parseJson<{ items: { c: string; text: string; tone: string; src: number[] }[] }>(await chat([{ role: "system", content: SYSTEM }, { role: "user", content: text }], { timeout: 240_000 }));
    for (const r of j.items ?? []) {
      const c = String(r.c);
      if (!ids.has(c)) continue;
      const t = clean(r.text ?? "").slice(0, 100);
      if (!t) { delete items[c]; continue; }
      items[c] = {
        d: tw(now).slice(0, 10), text: t, at: now,
        tone: (["多", "空", "中"].includes(r.tone) ? r.tone : "中") as Digest["tone"],
        src: (Array.isArray(r.src) ? r.src : []).map(Number).filter((n) => ids.get(c)!.has(n)).slice(0, 3),
      };
      done++;
    }
    for (const c of batch) left.delete(c);
  };
  await pool(batches, AI_PAR, async (batch, bi) => {
    if (fail >= 6) return; // 連續失敗太多次，剩下的下次排程再補
    try {
      await withSplit(batch, digestBatch);
      fail = 0;
    } catch (e) {
      fail++;
      console.log(`第 ${bi + 1} 批失敗：${(e as Error).message}`);
    }
    if (++n % 5 === 0) save([...left]);
  });
  save([...left]);
  console.log(`寫好 ${done}／${run.length} 檔重點，剩 ${left.size} 檔下次寫`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
