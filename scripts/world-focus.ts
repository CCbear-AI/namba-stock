// 早上國際焦點：美股收盤後，把國際行情、美股權值股漲跌、台積電 ADR 溢價和鉅亨網國際新聞交給學校 AI，
// 挑出今天台股開盤前該知道的幾件事，存到 data/world/日期.json（台灣日期），首頁顯示最新一份。
// 數字由程式算、新聞只用鉅亨網標題與摘要，AI 只負責挑重點和寫白話，每點附來源新聞。
// 用法：npm run world-focus（world-focus workflow 台灣週一～六 07:00 跑；週一那份涵蓋週末新聞）
import fs from "node:fs";
import path from "node:path";
import { INTL, worldQuote, type WorldQ } from "@/lib/world";
import { aiReady, chat, parseJson, AI_MODEL } from "@/lib/ai";

const OUT = path.join(process.cwd(), "data", "world");
const sign = (v: number, d = 2) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const tw = (t: number) => new Date(t + 8 * 3600e3).toISOString();

const EXTRA = [
  { s: "TSM", n: "台積電 ADR", g: "台股相關" }, { s: "^VIX", n: "VIX 恐慌指數", g: "匯率與利率" }, { s: "DX-Y.NYB", n: "美元指數", g: "匯率與利率" },
  { s: "CL=F", n: "西德州原油", g: "原物料" }, { s: "GC=F", n: "黃金", g: "原物料" },
];
// 跟台股供應鏈關係大的美股權值／半導體股，漲跌 2% 以上才寫進給 AI 的資料
const US_STOCKS: [string, string][] = [
  ["NVDA", "輝達"], ["AAPL", "蘋果"], ["MSFT", "微軟"], ["GOOGL", "Alphabet"], ["AMZN", "亞馬遜"], ["META", "Meta"], ["TSLA", "特斯拉"],
  ["AVGO", "博通"], ["AMD", "超微"], ["MU", "美光"], ["INTC", "英特爾"], ["QCOM", "高通"], ["ARM", "安謀"], ["SMCI", "美超微"],
  ["ASML", "艾司摩爾"], ["AMAT", "應用材料"], ["LRCX", "科林研發"], ["DELL", "戴爾"], ["ORCL", "甲骨文"],
];

type News = { id: number; title: string; summary: string; at: number };
type Point = { t: string; text: string; tone: "多" | "空" | "中"; src: number[] };

/** 鉅亨網國際股市新聞（公開 API），since 之後的，最多 max 則 */
async function news(since: number, max = 60): Promise<News[]> {
  const out: News[] = [];
  for (let page = 1; page <= 8 && out.length < max; page++) {
    const r = await fetch(`https://api.cnyes.com/media/api/v1/newslist/category/wd_stock?limit=30&page=${page}`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`鉅亨網 ${r.status}`);
    const items: { newsId: number; title: string; summary?: string; publishAt: number }[] = (await r.json()).items?.data ?? [];
    for (const x of items) {
      if (x.publishAt * 1000 < since) return out;
      if (/^(鉅亨速報|盤中速報)/.test(x.title.trim())) continue; // Factset 目標價、個股盤中大漲大跌的制式快訊，量多又沒內容
      const summary = (x.summary ?? "").replace(/&#10;|\n/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
      out.push({ id: x.newsId, title: x.title.trim(), summary: summary.slice(0, 160), at: x.publishAt * 1000 });
      if (out.length >= max) break;
    }
    if (!items.length) break;
  }
  return out;
}

async function facts(since: number) {
  const quotes = await Promise.all([...INTL, ...EXTRA].map(worldQuote));
  const stocks = await Promise.all(US_STOCKS.map(([s, n]) => worldQuote({ s, n, g: "美股個股" })));
  const tsmc = await worldQuote({ s: "2330.TW", n: "台積電", g: "" });
  const q = (s: string) => quotes.find((x) => x.s === s);
  const ok = (x?: WorldQ) => !!x && x.price > 0;
  const L: string[] = [];
  // 殖利率用「基點」、匯率直接寫台幣升貶，AI 才不會把「美元／台幣 +0.3%」寫成台幣升值
  const desc = (x: WorldQ) => {
    const p = x.price.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (x.s === "^TNX") return `${x.n}殖利率 ${p}%（比前一天${x.chg >= 0 ? "上升" : "下降"} ${Math.abs(Math.round(x.chg * 100))} 基點）`;
    if (x.s === "TSM") return `${x.n} ${p} 美元（${sign(x.pct)}%）`;
    if (x.s === "TWD=X") return `美元兌台幣 ${p}（台幣${x.pct > 0 ? "貶值" : "升值"} ${Math.abs(x.pct).toFixed(2)}%）`;
    return `${x.n} ${p}（${sign(x.pct)}%）`;
  };
  const sox = q("^SOX");
  const usDate = ok(sox) ? new Date(sox!.time).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : "";
  L.push(`美股最近交易日：${usDate || "不明"}（美國時間）`);
  for (const g of ["美股", "美股期貨", "台股相關", "亞洲", "匯率與利率", "原物料"]) {
    const xs = quotes.filter((x) => x.g === g && ok(x));
    if (xs.length) L.push(`${g}：${xs.map(desc).join("、")}`);
  }
  // 台積電 ADR 1 股＝5 股普通股；溢價＝ADR 換算台幣 ÷ 台股收盤 − 1
  const adr = q("TSM"), fx = q("TWD=X");
  if (ok(adr) && ok(fx) && ok(tsmc)) L.push(`台積電 ADR 換算台幣 ${Math.round((adr!.price * fx!.price) / 5)} 元，台股收盤 ${tsmc.price} 元，溢價 ${sign(((adr!.price * fx!.price) / 5 / tsmc.price - 1) * 100, 1)}%`);
  const movers = stocks.filter((x) => ok(x) && Math.abs(x.pct) >= 2).sort((a, b) => b.pct - a.pct);
  L.push(`美股權值／半導體股漲跌 2% 以上：${movers.length ? movers.map((x) => `${x.n} ${sign(x.pct, 1)}%`).join("、") : "沒有"}`);

  const ns = await news(since);
  L.push("", `國際新聞（鉅亨網，共 ${ns.length} 則，[編號] 標題｜摘要）：`);
  ns.forEach((x, i) => L.push(`[${i + 1}] ${tw(x.at).slice(5, 16).replace("T", " ")} ${x.title}${x.summary ? `｜${x.summary}` : ""}`));
  const keep = (xs: WorldQ[]) => xs.filter(ok).map((x) => ({ s: x.s, n: x.n, g: x.g, price: x.price, chg: x.chg, pct: x.pct }));
  return { text: L.join("\n"), usDate, news: ns, quotes: keep(quotes), movers: keep(movers) };
}

const SYSTEM = `你是財經編輯，每天早上替台股投資人整理「開盤前該知道的國際焦點」。
根據使用者提供的行情數字與新聞（每則有 [編號]），挑出對台股影響最大的 4～6 件事：第 1 點用一句話總結美股與費半、台積電 ADR，其餘每點都要是新聞裡的具體事件（公司財報與財測、聯準會官員談話、地緣政治等），寫出公司名稱和關鍵數字並附 src；不要把行情數字（VIX、亞股、匯率）各拆成一點。
規則：
- 只能使用提供的數字與新聞內容，不要捏造沒給的事件、原因或數字；推論用「可能」「恐」等保守說法。
- 指數、殖利率、匯率的漲跌方向一律以行情資料為準；新聞說法和行情不同時，照行情寫。單位照抄（台積電 ADR 是美元）。
- 每點 text 不超過 60 字，只放最關鍵的 1～2 個數字，不要把新聞摘要整段搬進來。
- 優先：美股主要指數與費半、聯準會／利率／匯率、AI 與半導體大廠消息、台股供應鏈相關公司、重大地緣政治。重複的新聞合併成一點。
- tone 是對台股的可能影響：「多」偏利多、「空」偏利空、「中」不明確。
- src 填這一點根據的新聞編號（行情數字那點可以是空陣列）。
- 繁體中文、台灣用語、白話，不要給買賣建議。
只輸出 JSON：
{"headline":"20字內標題","points":[{"t":"10字內小標","text":"60字內說明","tone":"多","src":[1,3]}],"tw":"下一個台股交易日可留意的一句話（40字內，不要寫「今天」，週末也適用）"}`;

async function main() {
  if (!aiReady()) { console.log("沒有 IAI_API_KEY，略過"); return; }
  const date = tw(Date.now()).slice(0, 10);
  fs.mkdirSync(OUT, { recursive: true });
  // 新聞從上一份之後開始（週一會涵蓋整個週末），最多回看 3 天、至少 12 小時
  const prev = fs.readdirSync(OUT).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${date}.json`).sort().at(-1);
  const prevAt = prev ? JSON.parse(fs.readFileSync(path.join(OUT, prev), "utf8")).generated as number : 0;
  const now = Date.now();
  const since = prevAt ? Math.min(Math.max(prevAt, now - 72 * 3600e3), now - 12 * 3600e3) : now - 24 * 3600e3;
  const f = await facts(since);
  console.log(f.text);
  if (!f.news.length) throw new Error("鉅亨網沒有新聞");
  let lastErr: unknown;
  for (let k = 0; k < 3; k++) {
    try {
      const j = parseJson<{ headline: string; points: Point[]; tw?: string }>(await chat([{ role: "system", content: SYSTEM }, { role: "user", content: f.text }], { timeout: 180_000 }));
      const points = (Array.isArray(j.points) ? j.points : []).filter((p) => p?.text).slice(0, 6).map((p) => ({
        t: String(p.t ?? "").slice(0, 16), text: String(p.text),
        tone: (["多", "空", "中"].includes(p.tone) ? p.tone : "中") as Point["tone"],
        src: (Array.isArray(p.src) ? p.src : []).map(Number).filter((n) => n >= 1 && n <= f.news.length).slice(0, 3),
      }));
      if (!j.headline || points.length < 2) throw new Error("格式不對");
      // 只留有被引用的新聞，前端連到鉅亨網原文
      const used = [...new Set(points.flatMap((p) => p.src))].sort((a, b) => a - b);
      const news = used.map((n) => ({ n, id: f.news[n - 1].id, title: f.news[n - 1].title, at: f.news[n - 1].at }));
      const out = { date, generated: Date.now(), model: AI_MODEL, usDate: f.usDate, headline: j.headline, points, tw: j.tw ?? "", quotes: f.quotes, movers: f.movers, news, facts: f.text };
      fs.writeFileSync(path.join(OUT, `${date}.json`), JSON.stringify(out, null, 1));
      console.log(`\n${out.headline}\n${points.map((p) => `- [${p.tone}] ${p.t}：${p.text} ${p.src.join(",")}`).join("\n")}\n台股留意：${out.tw}`);
      return;
    } catch (e) { lastErr = e; console.log(`第 ${k + 1} 次失敗：${(e as Error).message}`); await new Promise((r) => setTimeout(r, 30_000)); }
  }
  throw lastErr;
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
