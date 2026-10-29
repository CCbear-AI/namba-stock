// 分點晚報：分點資料進來後，把當天的分點重點（成績好的分點買了什麼、隔日沖、大額買賣超、突然大買、換手）
// 交給學校 AI 寫成晚報，存到 data/report/日期.json，首頁顯示最新一份；寫好後推播給有開「分點晚報」提醒的裝置。
// 數字由程式算，AI 只負責寫文字。
// 用法：npm run broker-report [-- --force 重寫] [-- --no-push 不推播]（daily-data workflow 掃完分點後跑）
import fs from "node:fs";
import path from "node:path";
import { getBrokerDays, marketView } from "@/lib/brokers";
import { dtView, handoffMarket } from "@/lib/brokerFlow";
import { scoreView } from "@/lib/brokerScore";
import { getDaily } from "@/lib/history";
import { aiReady, chat, parseJson, AI_MODEL } from "@/lib/ai";
import { pushReady, pushKind } from "@/lib/pushServer";

const OUT = path.join(process.cwd(), "data", "report");
const sign = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function facts(date: string) {
  const L: string[] = [`日期：${date}（以下都是當天收盤後的券商分點資料，只看得到各檔買超、賣超前 15 名分點）`];

  const sc = scoreView(5, 20);
  if (!("error" in sc)) {
    const by = new Map<string, { n: string; chg: number; who: string[]; amt: number }>();
    for (const r of sc.today) {
      const x = by.get(r.c) ?? { n: r.n, chg: r.chg, who: [], amt: 0 };
      x.who.push(`${r.b}(過去跟買5天平均${sign(r.avg, 2)}%、勝率${r.win}%)`); x.amt += r.amt;
      by.set(r.c, x);
    }
    const top = [...by.values()].sort((a, b) => b.amt - a.amt).slice(0, 8);
    if (top.length) L.push(`成績好的分點今天買進（買超金額大到小）：${top.map((x) => `${x.n}(當天${sign(x.chg)}%，${x.amt.toFixed(2)}億，${x.who.slice(0, 2).join("、")})`).join("；")}`);
    const multi = [...by.values()].filter((x) => x.who.length >= 2);
    if (multi.length) L.push(`兩家以上成績好的分點同時買：${multi.map((x) => x.n).join("、")}`);
  }

  const mk = marketView();
  if (!("error" in mk)) {
    const pair = (r: { n: string; b: string; lots: number; amt: number; chg: number; prev: number }) => `${r.n}←${r.b}(${Math.abs(r.amt).toFixed(2)}億，當天${sign(r.chg)}%${r.prev ? `，前5天有${r.prev}天也在` : "，新出現"})`;
    L.push(`大額買超組合前五：${mk.bigBuy.slice(0, 5).map(pair).join("；")}`);
    L.push(`大額賣超組合前五：${mk.bigSell.slice(0, 5).map(pair).join("；")}`);
    if (mk.sudden.length) L.push(`突然大買（一家分點買掉當天成交量15%以上、前5天沒買）：${mk.sudden.slice(0, 5).map((r) => `${r.n}←${r.b}(佔${r.pct.toFixed(1)}%)`).join("；")}`);
  }

  const dt = dtView();
  if (!("error" in dt)) {
    const hi = dt.today.filter((r) => r.g !== "低").slice(0, 6);
    if (hi.length) L.push(`隔日沖分點大買（佔近20日均量，明天可能被倒貨）：${hi.map((r) => `${r.n}(${r.pct.toFixed(0)}%，當天${sign(r.chg)}%，${r.who.join("、")})`).join("；")}`);
    const dumped = dt.dumped.filter((r) => r.ratio >= 50).slice(0, 5);
    if (dumped.length && dt.prev) L.push(`${md(dt.prev)}隔日沖買的今天已倒一半以上：${dumped.map((r) => `${r.n}(倒${r.ratio.toFixed(0)}%，今天${sign(r.chg)}%)`).join("、")}`);
    const st = dt.stats.find((s) => s.label === "20% 以上"), all = dt.stats.find((s) => s.label === "全部股票");
    if (st?.n && all) L.push(`參考：近一個多月隔日沖買超佔均量20%以上的股票，隔天平均開盤${sign(st.open, 2)}%、收盤${sign(st.close, 2)}%（全部股票 ${sign(all.close, 2)}%）`);
  }

  const ho = handoffMarket();
  if (!("error" in ho)) {
    L.push(`這週籌碼變安定（放長的分點在接、短線的在出）：${ho.stable.slice(0, 5).map((r) => `${r.n}(${sign(r.score, 0)}${r.lead ? `，${r.lead}領頭` : ""})`).join("、")}`);
    L.push(`這週籌碼變浮動（短線的分點在接、放長的在出）：${ho.float.slice(0, 5).map((r) => `${r.n}(${r.score})`).join("、")}`);
  }
  return L.join("\n");
}

const SYSTEM = `你是台股籌碼分析的晚報編輯。根據使用者提供的當天券商分點數據，寫一份給散戶看的「分點晚報」。
規則：
- 只能使用提供的數字與名稱，不要捏造新聞、原因或沒給的數字；推論用「可能」「顯示」等保守說法。
- 繁體中文、台灣用語、白話，不要給買賣建議，不要說「建議買進／賣出」。
- 「成績好的分點」是指過去跟著它買、之後平均跑贏大盤的分點，不代表這次一定會漲。
只輸出 JSON：
{"headline":"20字內標題","points":["重點1","重點2","重點3"],"watch":"明天可留意的一句話（40字內）"}
points 3～5 點，每點 60 字內，優先寫：成績好的分點買了什麼（尤其多家同時買）、隔日沖大買（明天可能賣壓）、大額或突然大買、籌碼換手。`;

async function main() {
  const force = process.argv.includes("--force");
  const { days } = getBrokerDays();
  const date = days.at(-1)?.date;
  const last = getDaily().dates.at(-1);
  // 分點資料要跟最新的交易日同一天才寫（16:30 富邦常還沒出，等 22:00 那次）
  if (!date || date !== last) { console.log(`分點資料 ${date ?? "沒有"}，最新交易日 ${last}，還沒到，略過`); return; }
  const file = path.join(OUT, `${date}.json`);
  if (fs.existsSync(file) && !force) { console.log(`${date} 晚報已經有了，略過`); return; }
  if (!aiReady()) { console.log("沒有 IAI_API_KEY，略過"); return; }
  const text = facts(date);
  console.log(text);
  let lastErr: unknown;
  for (let k = 0; k < 3; k++) {
    try {
      const j = parseJson<{ headline: string; points: string[]; watch?: string }>(await chat([{ role: "system", content: SYSTEM }, { role: "user", content: text }], { timeout: 240_000 }));
      if (!j.headline || !Array.isArray(j.points) || !j.points.length) throw new Error("格式不對");
      fs.mkdirSync(OUT, { recursive: true });
      const out = { date, generated: Date.now(), model: AI_MODEL, headline: j.headline, points: j.points.slice(0, 5), watch: j.watch ?? "", facts: text };
      fs.writeFileSync(file, JSON.stringify(out, null, 1));
      console.log(`\n${out.headline}\n- ${out.points.join("\n- ")}\n明天：${out.watch}`);
      if (pushReady && !process.argv.includes("--no-push")) {
        // 推播失敗不重寫晚報
        try { console.log("分點晚報推播", await pushKind("report", { title: `分點晚報 ${md(date)}`, body: out.headline, url: "/#report", tag: `report${date}` }), "則"); }
        catch (e) { console.error("推播失敗", (e as Error).message); }
      }
      return;
    } catch (e) { lastErr = e; console.log(`第 ${k + 1} 次失敗：${(e as Error).message}`); await new Promise((r) => setTimeout(r, 30_000)); }
  }
  throw lastErr;
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
