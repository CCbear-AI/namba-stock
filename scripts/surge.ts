// 飆股晚報：盤後用 lib/surge.ts 算全市場起漲訊號與分數（訊號都回測過），分數前 30 檔存起來，
// 前 15 檔把訊號、法人、融資、大戶、分點、月營收、新聞與重大訊息交給學校 AI，每檔寫「為什麼漲、誰在買」和「要留意的風險」，
// 最後再寫一段總評。存到 data/surge/日期.json，/surge 頁顯示；寫好推播給有開「飆股晚報」提醒的裝置。
// 數字由程式算，AI 只負責寫文字。
// 用法：npm run surge [-- --force 重寫] [-- --no-push 不推播] [-- --no-ai] [-- --backfill 20 回補過去名單] [-- --ai-past 回補名單補寫 AI]（daily-data workflow 分點晚報後跑）
import fs from "node:fs";
import path from "node:path";
import { backtest, candidates, SIG, type SurgeDay, type SurgeItem } from "@/lib/surge";
import { getBrokerDays, shortName } from "@/lib/brokers";
import { clsOf, CLS_NAME } from "@/lib/brokerCls";
import { scoreView } from "@/lib/brokerScore";
import { getChips, getDaily, getTdcc } from "@/lib/history";
import { readDigests, readSnewsDay, snewsDates } from "@/lib/stockNews";
import { newsFor } from "@/lib/news";
import { revenue } from "@/lib/revenue";
import { BY_CODE } from "@/lib/universe";
import { aiReady, chat, parseJson, pool, withSplit, AI_MODEL, AI_PAR } from "@/lib/ai";
import { pushReady, pushKind } from "@/lib/pushServer";

const OUT = path.join(process.cwd(), "data", "surge");
const KEEP = 30, AI_N = 15, BATCH = 5;
// 個股說明用 Furen-max：10/31 同資料比較，比 large 完整、會抓隔日沖風險，數字沒有編造；總評維持預設模型
const STOCK_MODEL = process.env.IAI_SURGE_MODEL || "Furen-max";
const sg = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const lots = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString()} 張`;

export const SYSTEM = `你是台股盤後的「飆股晚報」編輯。使用者給你幾檔今天出現起漲訊號的股票，資料全部是程式算好的事實（訊號、回測成績、法人、融資、大戶、分點、營收、新聞）。
請替每一檔寫兩句：
- why：為什麼會漲、誰在買（題材或消息有提供才寫；沒有消息就說「沒有相關新聞，主要是技術面／籌碼面」），70 字內。
- risk：最該留意的一個風險（例如短線漲多、隔日沖大買明天可能倒貨、融資大增、只有單一分點拉抬、沒有基本面支撐），30 字內。
規則：
- 只能用提供的資料，不要捏造新聞、題材、目標價或沒給的數字；推論用「可能」「顯示」。
- 訊號回測只代表過去平均，不代表這檔一定會漲。
- 融資減少、融資使用率低、外資或投信買超都不是風險；「倒貨」只在有隔日沖分點大買時才用。資料裡看不出明顯風險就寫「短線波動大，留意大盤」。
- 不給買賣建議，不說「建議買進」「可以布局」。繁體中文、台灣用語（槓桿、資金，不要用簡體字）。
只輸出 JSON：{"items":[{"c":"代號","why":"…","risk":"…"}]}`;

const SUM_SYSTEM = `你是台股盤後的「飆股晚報」編輯。根據今天出現起漲訊號、分數最高的股票清單（每檔已有一句說明）與訊號回測成績，寫總評。
規則：只能用提供的資料；不給買賣建議；繁體中文、台灣用語、白話。
只輸出 JSON：{"headline":"20字內標題","points":["重點1","重點2","重點3"],"watch":"明天可留意的一句話（40字內）"}
points 3 點、每點 60 字內，優先寫：今天起漲集中在哪些產業或題材、哪幾檔訊號最多而且籌碼面也支持、哪些是短線過熱或隔日沖進場要小心。`;

// past＝回補過去某天：只用那天收盤以前的資料（法人、集保、分點、重大訊息、新聞標題），月營收、新聞重點、分點成績是現在算的，不給
export type Ctx = { date: string; bt: ReturnType<typeof backtest>["bt"]; rev: Map<string, { ym: string; yoy: number }>; good: Map<string, string[]>; past?: boolean };
export function facts(it: SurgeItem, ctx: Ctx) {
  const { c } = it;
  const L = [`## ${c} ${it.n}（${it.ind}），${md(ctx.date)} 收盤 ${it.close}（${sg(it.pct, 2)}%），近5日 ${sg(it.d5)}%、近20日 ${sg(it.d20)}%，量比 ${it.vr.toFixed(1)} 倍，成交值 ${it.val.toFixed(1)} 億，飆股分數 ${it.score}`];
  const st = new Map(ctx.bt.stats.map((s) => [s.id, s]));
  L.push(`訊號：${it.sigs.map((g) => { const s = st.get(g)!; return `${SIG[g].label}（過去 ${s.n} 次，20天後平均超額 ${sg(s.ex20, 2)}%、20天內飆20%機率 ${s.hit}%）`; }).join("；")}`);
  if (it.risk.length) L.push(`程式標記風險：${it.risk.join("、")}`);
  const chips = getChips().filter((d) => d.date <= ctx.date);
  const last5 = chips.slice(-5).map((d) => d.s[c]).filter(Boolean) as number[][];
  if (last5.length) {
    const t = last5.at(-1)!;
    L.push(`法人：今天外資 ${lots(t[0])}、投信 ${lots(t[1])}；近5日外資 ${lots(last5.reduce((a, x) => a + x[0], 0))}、投信 ${lots(last5.reduce((a, x) => a + x[1], 0))}`);
    let mi = chips.length - 1;
    while (mi > 0 && !Object.values(chips[mi].s).some((v) => v[3] > 0)) mi--;
    const m1 = chips[mi]?.s[c], m0 = chips[mi - 5]?.s[c];
    if (m1?.[3] && m0?.[3]) L.push(`融資：近5日 ${sg((m1[3] / m0[3] - 1) * 100)}%${m1[5] ? `、使用率 ${((m1[3] / m1[5]) * 100).toFixed(0)}%` : ""}`);
  }
  const td = getTdcc().filter((d) => d.date <= ctx.date);
  const t1 = td.at(-1)?.s[c], t0 = td.at(-2)?.s[c];
  if (t1 && t0) L.push(`千張大戶：${t1[0].toFixed(1)}%（這週 ${sg(t1[0] - t0[0], 2)}），股東人數 ${sg(t1[1] - t0[1], 0)}`);
  const { days, names } = getBrokerDays();
  const bd = days.find((d) => d.date === ctx.date);
  if (bd) {
    const rows = (bd.s.get(c)?.rows ?? []).map(([id, b, s]) => ({ id, net: b - s })).sort((a, b) => b.net - a.net);
    const vol = bd.s.get(c)?.vol ?? 0;
    const top = rows.filter((r) => r.net > 0).slice(0, 3);
    if (top.length && vol) L.push(`今天分點買超前3：${top.map((r) => `${shortName(names.get(r.id) ?? r.id)}${clsOf(r.id) !== "none" ? `［${CLS_NAME[clsOf(r.id)]}］` : ""}${lots(r.net)}（佔成交 ${((r.net / vol) * 100).toFixed(1)}%）`).join("、")}`);
  }
  const gd = ctx.good.get(c);
  if (gd?.length) L.push(`成績好的分點（過去跟買平均跑贏大盤）今天買進：${gd.join("、")}`);
  const rv = ctx.rev.get(c);
  if (rv) L.push(`月營收：${rv.ym}年增 ${sg(rv.yoy)}%`);
  const dg = ctx.past ? null : readDigests()[c];
  if (dg && Date.now() - dg.at < 7 * 86400e3) L.push(`近一週新聞重點（${dg.tone === "多" ? "偏多" : dg.tone === "空" ? "偏空" : "中性"}）：${dg.text}`);
  const ds = getDaily().dates, at = ds.indexOf(ctx.date);
  const since = ds[at - 5] ?? ctx.date;
  if (ctx.past) {
    const tl = snewsDates().filter((d) => d >= since && d <= ctx.date).flatMap(readSnewsDay).filter((x) => x.c.includes(c) && x.c.length <= 3 && !x.t.includes("速報")) // 標了一堆股票的是盤勢綜合文章，不是這檔的題材.slice(-3);
    if (tl.length) L.push(`近幾天新聞標題：${tl.map((x) => x.t).join("；")}`);
  }
  const nw = newsFor([c], since).filter((x) => x.d <= ctx.date && (x.imp ?? 1) >= 2 && x.sum).slice(0, 3);
  if (nw.length) L.push(`重大訊息：${nw.map((x) => `${md(x.d)} ${x.sum}`).join("；")}`);
  return L.join("\n");
}

/** 回補過去 N 個交易日的名單（只有訊號、沒有 AI），給成績單用；已經有檔案的不動 */
function backfill(n: number) {
  const { dates } = getDaily();
  const { bt } = backtest();
  fs.mkdirSync(OUT, { recursive: true });
  for (let i = dates.length - 1 - n; i < dates.length - 1; i++) {
    const f = path.join(OUT, `${dates[i]}.json`);
    if (fs.existsSync(f)) continue;
    const items = candidates(i).filter((x) => x.score > 0 && x.pct > 0).slice(0, KEEP).map((x) => ({ ...x, n: BY_CODE.get(x.c)?.n ?? x.c, ind: BY_CODE.get(x.c)?.ind ?? "" }));
    fs.writeFileSync(f, JSON.stringify({ date: dates[i], generated: Date.now(), bt, items, backfill: true }));
    console.log(`回補 ${dates[i]} ${items.length} 檔`);
  }
}

/** 今天成績好的分點買了什麼（只有最新一天有意義） */
export function goodToday(date: string) {
  const good = new Map<string, string[]>();
  const sc = scoreView(5, 20);
  if (!("error" in sc) && sc.date === date) for (const r of sc.today) good.set(r.c, [...(good.get(r.c) ?? []), `${r.b}(${lots(r.lots)}，過去跟買 5 天平均 ${sg(r.avg, 2)}%)`]);
  return good;
}

/** 前 AI_N 檔寫個股說明，再寫總評；寫好（push 時）推播 */
async function writeAi(out: SurgeDay, save: () => void, ctx: Ctx, push: boolean) {
  const { date, bt } = ctx;
  const items = out.items;
  const todo = items.slice(0, AI_N);
  const text = new Map(todo.map((it) => [it.c, facts(it, ctx)]));
  const batches = Array.from({ length: Math.ceil(todo.length / BATCH) }, (_, i) => todo.slice(i * BATCH, (i + 1) * BATCH));
  let done = 0;
  await pool(batches, AI_PAR, async (b, bi) => {
    try {
      await withSplit(b, async (part) => {
        const j = parseJson<{ items: { c: string; why: string; risk?: string }[] }>(await chat([{ role: "system", content: SYSTEM }, { role: "user", content: part.map((x) => text.get(x.c)).join("\n\n") }], { model: STOCK_MODEL, timeout: 300_000, maxTokens: 12000 }));
        const ok = new Map(part.map((x) => [x.c, x]));
        for (const r of j.items ?? []) {
          const it = ok.get(String(r.c));
          if (!it || !r.why) continue;
          it.ai = String(r.why).trim().slice(0, 140); it.warn = String(r.risk ?? "").trim().slice(0, 60);
          done++;
        }
      });
    } catch (e) { console.log(`第 ${bi + 1} 批失敗：${(e as Error).message}`); }
  });
  console.log(`${date} 個股說明 ${done}/${todo.length}`);
  save();

  const sumFacts = [
    `日期：${date}。下面是今天收盤後出現起漲訊號、飆股分數最高的股票（分數＝各訊號過去 20 天平均超額報酬加總）。`,
    `回測參考：全部股票任選一天買進，20 天內最高漲到 +20% 的機率 ${bt.base.hit}%；分數 4 分以上的 ${bt.oos.at(-1)?.hit}%，但 20 天內也有 ${bt.oos.at(-1)?.drop}% 跌到 -10%（全部股票 ${bt.base.drop}%），代表波動大。`,
    ...items.slice(0, AI_N).map((x) => `${x.c} ${x.n}（${x.ind}）${sg(x.pct, 2)}%，分數 ${x.score}，訊號：${x.sigs.map((g) => SIG[g].label).join("、")}${x.risk.length ? `，風險：${x.risk.join("、")}` : ""}${x.ai ? `。說明：${x.ai}` : ""}${x.warn ? `；留意：${x.warn}` : ""}`),
    `其他上榜：${items.slice(AI_N).map((x) => `${x.n}(${x.ind})`).join("、")}`,
    `訊號回測：${bt.stats.filter((s) => s.n).map((s) => `${SIG[s.id].label} ${s.n}次 20天超額${sg(s.ex20, 2)}%`).join("；")}`,
  ].join("\n");
  for (let k = 0; k < 3; k++) {
    try {
      const j = parseJson<{ headline: string; points: string[]; watch?: string }>(await chat([{ role: "system", content: SUM_SYSTEM }, { role: "user", content: sumFacts }], { timeout: 300_000, maxTokens: 16000 }));
      if (!j.headline || !Array.isArray(j.points) || !j.points.length) throw new Error("格式不對");
      Object.assign(out, { model: AI_MODEL, headline: j.headline, points: j.points.slice(0, 4), watch: j.watch ?? "", generated: Date.now() });
      save();
      console.log(`\n${out.headline}\n- ${out.points!.join("\n- ")}\n明天：${out.watch}`);
      if (pushReady && push) {
        try { console.log("飆股晚報推播", await pushKind("surge", { title: `飆股晚報 ${md(date)}`, body: out.headline!, url: "/surge", tag: `surge${date}` }), "則"); }
        catch (e) { console.error("推播失敗", (e as Error).message); }
      }
      return;
    } catch (e) { console.log(`總評第 ${k + 1} 次失敗：${(e as Error).message}`); await new Promise((r) => setTimeout(r, 20_000)); }
  }
  console.log(`${date} 總評沒寫成，名單與個股說明已存檔（下次排程會重寫）`);
}

/** 回補的名單補寫 AI（只用那天以前的資料），一次跑兩天 */
async function aiPast() {
  const { bt } = backtest();
  const files = fs.readdirSync(OUT).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
  const todo = files.map((f) => ({ f, d: JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")) as SurgeDay })).filter((x) => x.d.backfill && !x.d.headline);
  console.log(`要補 AI 的回補名單 ${todo.length} 天`);
  await pool(todo, 2, async ({ f, d }) => {
    const save = () => fs.writeFileSync(path.join(OUT, f), JSON.stringify(d));
    await writeAi(d, save, { date: d.date, bt: d.bt ?? bt, rev: new Map(), good: new Map(), past: true }, false);
  });
}

async function main() {
  const bf = process.argv.indexOf("--backfill");
  if (bf > 0) { backfill(Number(process.argv[bf + 1]) || 20); return; }
  if (process.argv.includes("--ai-past")) { await aiPast(); return; }
  const force = process.argv.includes("--force");
  const { dates } = getDaily();
  const date = dates.at(-1)!;
  // 分點、融資要跟最新交易日同一天才寫（16:30 那次還沒有，等 22:00）
  const bdate = getBrokerDays().days.at(-1)?.date;
  if (bdate !== date && !force) { console.log(`分點資料 ${bdate ?? "沒有"}，最新交易日 ${date}，還沒到，略過`); return; }
  const file = path.join(OUT, `${date}.json`);
  const prev: SurgeDay | null = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  if (prev?.headline && !force) { console.log(`${date} 飆股晚報已經有了，略過`); return; }

  const t0 = Date.now();
  const { bt } = backtest();
  console.log(`回測 ${bt.from}～${bt.to}（${((Date.now() - t0) / 1000).toFixed(1)} 秒），全體飆20%機率 ${bt.base.hit}%`);
  // 今天收紅、分數 > 0 的才列（前兆出現但今天下跌的不算起漲）
  const items: SurgeItem[] = candidates().filter((x) => x.score > 0 && x.pct > 0).slice(0, KEEP)
    .map((x) => ({ ...x, n: BY_CODE.get(x.c)?.n ?? x.c, ind: BY_CODE.get(x.c)?.ind ?? "" }));
  console.log(`候選 ${items.length} 檔：${items.slice(0, 10).map((x) => `${x.n}(${x.score})`).join("、")}`);
  const out: SurgeDay = { date, generated: Date.now(), bt, items };
  const save = () => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(file, JSON.stringify(out)); };
  save();
  if (process.argv.includes("--no-ai") || !aiReady()) { console.log("只算訊號，不寫 AI"); return; }

  await writeAi(out, save, { date, bt, rev: await revenue(), good: goodToday(date) }, !process.argv.includes("--no-push"));
}

// 被別的腳本 import（例如模型比較）時不要自己跑
if (/surge\.ts$/.test(process.argv[1] ?? "")) main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
