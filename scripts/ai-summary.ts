// 盤後 AI 摘要：把當天數字（大盤、漲跌家數、類股、法人、期貨、國際）整理好交給學校 AI 寫重點，
// 存到 data/summary/日期.json，首頁顯示最新一份。數字由程式算，AI 只負責寫文字。
// 用法：npm run ai-summary（daily-data workflow 16:30、22:00 各跑一次，22:00 那次會多融資券）
import fs from "node:fs";
import path from "node:path";
import { GET as marketGET } from "@/app/api/market/route";
import { GET as taiexGET } from "@/app/api/taiex/route";
import { GET as chipsGET } from "@/app/api/chips/route";
import { GET as sectorsGET } from "@/app/api/sectors/route";
import { aiReady, chat, parseJson, AI_MODEL } from "@/lib/ai";
import { THEMES } from "@/lib/themes";

const OUT = path.join(process.cwd(), "data", "summary");
const call = async (fn: (r: Request) => Promise<Response> | Response, url: string) => (await fn(new Request(`http://localhost${url}`))).json();
const sign = (v: number, d = 2) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;

type Q = { c: string; n: string; price: number; chg: number; pct: number; value?: number; vol?: number };

async function facts() {
  const [m, t, c, s] = await Promise.all([
    call(marketGET, "/api/market"), call(taiexGET as () => Promise<Response>, "/api/taiex"),
    call(chipsGET, "/api/chips"), call(sectorsGET as () => Promise<Response>, "/api/sectors"),
  ]);
  const date = new Date(m.time + 8 * 3600e3).toISOString().slice(0, 10);
  const L: string[] = [`日期：${date}`];
  for (const q of m.indices as Q[]) L.push(`${q.n}：${q.price}（${sign(q.chg)}，${sign(q.pct)}%）`);
  const b = m.breadth;
  L.push(`上市櫃漲跌家數：上漲 ${b.up}（漲停 ${b.limitUp}）、平盤 ${b.flat}、下跌 ${b.down}（跌停 ${b.limitDown}），成交金額 ${Math.round(b.value)} 億`);

  const stocks = (m.stocks as Q[]).filter((x) => x.price > 0);
  const byVal = [...stocks].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 10);
  L.push(`成交金額前十：${byVal.map((x) => `${x.n}(${sign(x.pct, 1)}%)`).join("、")}`);
  const big = stocks.filter((x) => (x.value ?? 0) >= 5); // value 單位是億
  L.push(`成交5億以上漲幅前五：${[...big].sort((a, b) => b.pct - a.pct).slice(0, 5).map((x) => `${x.n}(${sign(x.pct, 1)}%)`).join("、")}`);
  L.push(`成交5億以上跌幅前五：${[...big].sort((a, b) => a.pct - b.pct).slice(0, 5).map((x) => `${x.n}(${sign(x.pct, 1)}%)`).join("、")}`);

  // 族群平均漲跌
  const pct = new Map(stocks.map((x) => [x.c, x.pct]));
  const th = Object.entries(THEMES).map(([n, cs]) => {
    const v = cs.map((k) => pct.get(k)).filter((x): x is number => x != null);
    return { n, p: v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0, k: v.length };
  }).filter((x) => x.k >= 3).sort((a, b) => b.p - a.p);
  L.push(`強勢族群：${th.slice(0, 5).map((x) => `${x.n}(${sign(x.p, 1)}%)`).join("、")}；弱勢族群：${th.slice(-5).reverse().map((x) => `${x.n}(${sign(x.p, 1)}%)`).join("、")}`);

  const sec = (s.sectors as { name: string; pct: number }[]).filter((x) => x.pct != null).sort((a, b) => b.pct - a.pct);
  if (sec.length) L.push(`類股指數漲幅前三：${sec.slice(0, 3).map((x) => `${x.name}(${sign(x.pct)}%)`).join("、")}；跌幅前三：${sec.slice(-3).reverse().map((x) => `${x.name}(${sign(x.pct)}%)`).join("、")}`);

  const ct = t.contrib;
  if (ct) L.push(`權值股拉抬：${ct.up.slice(0, 3).map((x: { n: string; pt: number }) => `${x.n}(${sign(x.pt, 1)}點)`).join("、")}；拖累：${ct.down.slice(0, 3).map((x: { n: string; pt: number }) => `${x.n}(${sign(x.pt, 1)}點)`).join("、")}`);
  if (t.futures?.price) L.push(`台指期近月：${t.futures.price}（${sign(t.futures.chg, 0)}），基差 ${t.futures.basis}`);

  if (!c.error) {
    const mk = c.market;
    // 籌碼 API 的金額單位已經是億
    L.push(`三大法人（${c.date}）：外資 ${sign(mk.f, 1)} 億、投信 ${sign(mk.t, 1)} 億、自營商 ${sign(mk.d, 1)} 億，合計 ${sign(mk.total, 1)} 億；外資連續${mk.fStreak > 0 ? `買超 ${mk.fStreak}` : `賣超 ${-mk.fStreak}`} 天、投信連續${mk.tStreak > 0 ? `買超 ${mk.tStreak}` : `賣超 ${-mk.tStreak}`} 天`);
    if (mk.marginChg != null) L.push(`融資餘額 ${mk.marginAmt} 億（${sign(mk.marginChg, 1)} 億）`);
    const f = c.futures;
    if (Array.isArray(f?.tx)) L.push(`期貨（${f.date}）：外資台指期未平倉淨 ${f.tx[0]} 口（前一日 ${f.prev?.tx?.[0] ?? "—"}）${f.pcr ? `，P/C 比 ${f.pcr}%` : ""}`);
    const r = c.rank;
    const top = (a: { n: string }[] | undefined) => (a ?? []).slice(0, 5).map((x) => x.n).join("、");
    if (r?.f) L.push(`外資買超前五：${top(r.f.buy)}；賣超前五：${top(r.f.sell)}`);
    if (r?.t) L.push(`投信買超前五：${top(r.t.buy)}`);
  }

  const w = (t.world as { n: string; pct: number }[] | undefined)?.filter((x) => x.pct) ?? [];
  if (w.length) L.push(`國際：${w.map((x) => `${x.n} ${sign(x.pct)}%`).join("、")}`);
  return { date, text: L.join("\n"), open: m.open as boolean, marketDate: date };
}

const SYSTEM = `你是台股盤後評論員。根據使用者提供的當日數據，寫一份給散戶看的盤後重點。
規則：
- 只能使用提供的數字與名稱，不要捏造新聞、原因或沒給的數字；推論要用「可能」「顯示」等保守說法。
- 繁體中文、台灣用語、白話，不要給買賣建議。
只輸出 JSON：
{"headline":"20字內標題","points":["重點1","重點2","重點3"],"watch":"明天可留意的一句話（40字內）"}
points 3～5 點，每點 50 字內，涵蓋大盤表現、資金集中的族群或個股、法人動向、期貨或國際（有資料才寫）。`;

async function main() {
  if (!aiReady()) { console.log("沒有 IAI_API_KEY，略過"); return; }
  const f = await facts();
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  if (f.date !== today && !process.argv.includes("--force")) { console.log(`今天沒開盤（資料日期 ${f.date}），略過`); return; }
  console.log(f.text);
  let lastErr: unknown;
  for (let k = 0; k < 3; k++) {
    try {
      const j = parseJson<{ headline: string; points: string[]; watch?: string }>(await chat([{ role: "system", content: SYSTEM }, { role: "user", content: f.text }], { timeout: 120_000 }));
      if (!j.headline || !Array.isArray(j.points) || !j.points.length) throw new Error("格式不對");
      fs.mkdirSync(OUT, { recursive: true });
      const out = { date: f.date, generated: Date.now(), model: AI_MODEL, headline: j.headline, points: j.points.slice(0, 5), watch: j.watch ?? "", facts: f.text };
      fs.writeFileSync(path.join(OUT, `${f.date}.json`), JSON.stringify(out, null, 1));
      console.log(`\n${out.headline}\n- ${out.points.join("\n- ")}\n明天：${out.watch}`);
      return;
    } catch (e) { lastErr = e; console.log(`第 ${k + 1} 次失敗：${(e as Error).message}`); await new Promise((r) => setTimeout(r, 30_000)); }
  }
  throw lastErr;
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
