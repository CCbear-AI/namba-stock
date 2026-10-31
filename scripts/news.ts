// 重大訊息：抓證交所（上市）、櫃買中心（上櫃）開放資料的每日重大訊息，存到 data/news/發言日期.json，
// 再交給學校 AI 每則寫一句白話摘要＋分類＋重要程度。開放資料每天早上才放出前一個交易日的公告。
// 用法：npm run news [-- --no-ai 只抓不摘要]（daily-data workflow 16:30、22:00 都跑；已經摘要過的不重做，沒寫完的下次補）
import fs from "node:fs";
import path from "node:path";
import { NEWS_DIR, NEWS_TAGS, newsDates, readNewsDay, type News, type NewsDay } from "@/lib/news";
import { aiReady, chat, parseJson, pool, AI_PAR, AI_MODEL } from "@/lib/ai";
import { getDaily } from "@/lib/history";
import { BY_CODE } from "@/lib/universe";

const SRC = [
  { url: "https://openapi.twse.com.tw/v1/opendata/t187ap04_L", code: "公司代號", name: "公司名稱", title: "主旨 " },
  { url: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O", code: "SecuritiesCompanyCode", name: "CompanyName", title: "主旨" },
];
const BATCH = 8; // 一批太多則，學校 AI 思考會用光字數回空白
const MAX_AI = 400; // 一次最多摘要幾則（學校 AI 慢，避免拖垮整個排程）
// 摘要用的模型：env IAI_NEWS_MODEL 或 --model 指定，預設跟其他 AI 一樣
const MODEL = (process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : "") || process.env.IAI_NEWS_MODEL || AI_MODEL;

const roc = (s: string) => { const v = String(s).padStart(7, "0"); return `${Number(v.slice(0, 3)) + 1911}-${v.slice(3, 5)}-${v.slice(5, 7)}`; };
const hm = (s: string) => { const v = String(s).padStart(6, "0"); return `${v.slice(0, 2)}:${v.slice(2, 4)}`; };
// 原文偶爾有 HTML 編碼字（例如「子」寫成 &#12070;）
const unescape = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
const clean = (s: string) => unescape(String(s ?? "")).replace(/\r?\n/g, "").replace(/\s+/g, " ").trim();
// 例行公告不送 AI：用規則分類，摘要就用主旨（學校 AI 一天處理不完全部）
const ROUTINE: [RegExp, string][] = [
  [/注意交易資訊/, "注意處置"],
  [/^(?!.*決議事項).*(股東(常|臨時)?會.*(召開|日期|開會)|召開.*股東(常|臨時)?會)/, "股東會"],
  [/董事會.*(召開日期|日期)/, "其他"],
  [/公告期間|更名|面額.*變更/, "其他"],
  [/取得.*(有價證券|債券|基金|定存|附買回)|處分.*(債券|基金|附買回)/, "其他"],
  [/(背書保證|資金貸與).*(餘額|金額)|董事會.*(代理|簽證會計師)/, "其他"],
];
function routine(x: News) {
  const r = ROUTINE.find(([re]) => re.test(x.title));
  if (!r) return false;
  x.sum = x.title.replace(/^(公告|代(子|孫)公司[^公]*公告)?本公司/, "").slice(0, 80);
  x.tag = r[1];
  x.imp = 1;
  delete x.body;
  return true;
}
const norm = (s: string) => s.replace(/[\s，,。：:「」()（）]/g, "").replace(/\d+年\d+月\d+日|\d+\/\d+\/\d+/g, "");

async function fetchAll(): Promise<News[]> {
  const out: News[] = [];
  for (const s of SRC) {
    try {
      const r = await fetch(s.url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) });
      const j = (await r.json()) as Record<string, string>[];
      for (const x of j) {
        const c = clean(x[s.code]);
        if (!c) continue;
        out.push({ c, n: clean(x[s.name]), d: roc(x["發言日期"]), t: hm(x["發言時間"]), title: clean(x[s.title] ?? x["主旨"]), body: unescape(String(x["說明"] ?? "")).replace(/\r/g, "").slice(0, 900) });
      }
      console.log(`${s.url.includes("tpex") ? "上櫃" : "上市"} ${j.length} 則`);
    } catch (e) { console.error("抓不到", s.url, (e as Error).message); }
  }
  return out;
}

const SYSTEM = `你是台股新聞編輯。使用者會給你幾則上市櫃公司的「重大訊息」原文（主旨＋說明），請每則寫一句給散戶看的白話摘要。
規則：
- 只用原文裡的事實與數字，不要捏造、不要推測股價，不要給買賣建議。
- 摘要 40 字內，講重點：發生什麼事、關鍵數字（金額、EPS、股利、年增率、日期）。不用重複公司名稱。
- tag 從這些挑一個：${NEWS_TAGS.join("、")}
- imp 重要程度：3＝可能影響股價的實質消息（獲利或營收大幅變化、重大合約或訂單、併購、增資減資、處置股票、澄清媒體報導、重大災損或訴訟）；2＝一般營運消息（董事會決議、投資、人事異動、法說會）；1＝例行公告（更名或面額變更期間公告、股東會日期、注意交易資訊、取得少量有價證券）。
只輸出 JSON：{"items":[{"i":編號,"sum":"摘要","tag":"分類","imp":1到3}]}`;

async function summarize(batch: News[]) {
  const text = batch.map((x, i) => `#${i} ${x.n}（${x.c}）\n主旨：${x.title}\n說明：${(x.body ?? "").slice(0, 700)}`).join("\n\n");
  const j = parseJson<{ items: { i: number; sum: string; tag: string; imp: number }[] }>(await chat([{ role: "system", content: SYSTEM }, { role: "user", content: text }], { model: MODEL, timeout: 240_000 }));
  let n = 0;
  for (const r of j.items ?? []) {
    const x = batch[Number(r.i)];
    if (!x || !r.sum) continue;
    x.sum = clean(r.sum).slice(0, 80);
    x.tag = (NEWS_TAGS as readonly string[]).includes(r.tag) ? r.tag : "其他";
    x.imp = ([1, 2, 3].includes(Number(r.imp)) ? Number(r.imp) : 2) as 1 | 2 | 3;
    delete x.body;
    n++;
  }
  return n;
}

async function main() {
  fs.mkdirSync(NEWS_DIR, { recursive: true });
  const fresh = await fetchAll();
  const dates = [...new Set([...newsDates().slice(-3), ...fresh.map((x) => x.d)])].sort();
  const days = new Map<string, NewsDay>(dates.map((d) => [d, readNewsDay(d)]));

  // 近 40 天出現過的「公司＋主旨」，同樣的公告再出現就標成重複（更名、面額變更要連續公告好幾個月）
  const seenBefore = new Set<string>();
  for (const d of newsDates().slice(-40)) for (const x of (days.get(d) ?? readNewsDay(d)).items) seenBefore.add(`${x.c}|${norm(x.title)}`);

  let added = 0;
  for (const x of fresh) {
    const day = days.get(x.d)!;
    if (day.items.some((y) => y.c === x.c && y.t === x.t && y.title === x.title)) continue;
    const k = `${x.c}|${norm(x.title)}`;
    if (seenBefore.has(k)) { x.rep = true; delete x.body; }
    else routine(x);
    seenBefore.add(k);
    day.items.push(x);
    added++;
  }
  console.log(`新增 ${added} 則`);
  const save = () => { for (const [d, day] of days) if (day.items.length) fs.writeFileSync(path.join(NEWS_DIR, `${d}.json`), JSON.stringify(day)); };
  save();

  if (process.argv.includes("--no-ai")) return;
  if (!aiReady()) { console.log("沒有 IAI_API_KEY，只存原文"); return; }
  // 市值大的公司先寫（一次寫不完的下次排程補；還沒摘要的網頁先顯示原文主旨）
  const { s: px } = getDaily();
  const cap = (c: string) => (BY_CODE.get(c)?.sh ?? 0) * (px.get(c)?.c.filter((v) => v > 0).at(-1) ?? 0);
  const todo = [...days.values()].flatMap((d) => d.items.filter((x) => !x.rep && !x.sum)).sort((a, b) => cap(b.c) - cap(a.c)).slice(0, MAX_AI);
  console.log(`要摘要 ${todo.length} 則（${MODEL}，同時 ${AI_PAR} 批）`);
  const batches = Array.from({ length: Math.ceil(todo.length / BATCH) }, (_, i) => todo.slice(i * BATCH, (i + 1) * BATCH));
  let done = 0, fail = 0, n = 0;
  await pool(batches, AI_PAR, async (b, i) => {
    if (fail >= 8) return; // 連續失敗太多次，剩下的下次排程再補
    try { const k = await summarize(b); done += k; fail = 0; }
    catch (e) { fail++; console.log(`第 ${i + 1} 批失敗：${(e as Error).message}`); }
    if (++n % 5 === 0) { save(); console.log(`${n}/${batches.length} 批`); } // 中途存檔，排程被砍也不會白做
  });
  save();
  console.log(`摘要完成 ${done}／${todo.length} 則`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
