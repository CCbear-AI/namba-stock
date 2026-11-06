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
  for (const q of m.indices as Q[]) L.push(`${q.n.replace("發行量加權股價指數", "加權指數")}：${q.price}（${sign(q.chg)}，${sign(q.pct)}%）`);
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
  const tw = (m.indices as Q[]).find((q) => q.n.includes("加權"));
  const nm = (x: { n: string }) => x.n.replace(/\*$/, "");
  return {
    date, text: L.join("\n"), open: m.open as boolean, marketDate: date, taiexChg: tw?.chg ?? NaN,
    names: stocks.map(nm),
    up: ((ct?.up ?? []) as { n: string }[]).slice(0, 3).map(nm),
    down: ((ct?.down ?? []) as { n: string }[]).slice(0, 3).map(nm),
  };
}

const SYSTEM = `你是台股盤後評論員。根據使用者提供的當日數據，寫一份給散戶看的盤後重點。
規則：
- 只能使用提供的數字與名稱，不要捏造新聞、原因或沒給的數字；推論要用「可能」「顯示」等保守說法。
- 繁體中文、台灣用語、白話，不要給買賣建議。
只輸出 JSON：
{"headline":"20字內標題","points":["重點1","重點2","重點3"],"watch":"明天可留意的一句話（40字內）"}
講權值股拉抬／拖累點數時，個股名稱只能用「權值股拉抬」「拖累」那一行列出的，不要換成別檔。
標題若寫點數，必須是加權指數的漲跌點數（例如跌 1374 點可寫「重挫逾千點」「跌1374點」），不能拿基差、期貨或個股的點數。
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
      const j = parseJson<{ headline: string; points: string[]; watch?: string }>(await chat([{ role: "system", content: SYSTEM }, { role: "user", content: f.text }], { timeout: 120_000, maxTokens: 16000 }));
      if (!j.headline || !Array.isArray(j.points) || !j.points.length) throw new Error("格式不對");
      const bad = checkPoints(j.headline, f.taiexChg);
      if (bad) throw new Error(`標題點數不對：${bad}`);
      const wrong = checkNames(j.points, f.names, f.up, f.down);
      if (wrong.length) {
        const msg = wrong.map((w) => w.why).join("；");
        // 最後一次還錯：把寫錯的那幾點拿掉（剩 3 點以上才這樣做），不要整份摘要都沒寫
        const keep = j.points.filter((_, i) => !wrong.some((w) => w.i === i));
        if (k < 2 || keep.length < 3) throw new Error(`權值股名稱不對：${msg}`);
        console.log(`權值股名稱不對（${msg}），拿掉 ${wrong.length} 點`);
        j.points = keep;
      }
      fs.mkdirSync(OUT, { recursive: true });
      const out = { date: f.date, generated: Date.now(), model: AI_MODEL, headline: j.headline, points: j.points.slice(0, 5), watch: j.watch ?? "", facts: f.text };
      fs.writeFileSync(path.join(OUT, `${f.date}.json`), JSON.stringify(out, null, 1));
      console.log(`\n${out.headline}\n- ${out.points.join("\n- ")}\n明天：${out.watch}`);
      return;
    } catch (e) { lastErr = e; console.log(`第 ${k + 1} 次失敗：${(e as Error).message}`); await new Promise((r) => setTimeout(r, 30_000)); }
  }
  throw lastErr;
}

// 中文數字（三百、一千二、兩千）或阿拉伯數字轉成數值
function toNum(s: string): number {
  if (/[0-9]/.test(s)) return Number(s.replace(/,/g, ""));
  const D: Record<string, number> = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const U: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 萬: 10000 };
  let total = 0, cur = 0, lastU = 1;
  for (const ch of s) {
    if (ch in D) cur = D[ch];
    else if (ch in U) { total += (cur || 1) * U[ch]; lastU = U[ch]; cur = 0; }
  }
  return total + (cur ? cur * (lastU >= 10 ? lastU / 10 : 1) : 0);
}

/** 標題提到「N 點」時要跟加權指數漲跌點數對得上（「逾/超過」＝下限、「近」＝上限）；對不上回傳說明 */
export function checkPoints(text: string, chg: number): string | null {
  if (!Number.isFinite(chg)) return null;
  const a = Math.abs(chg);
  for (const m of text.matchAll(/(逾|超過|超|近|約|將近)?\s*([0-9][0-9,.]*|[零一二兩三四五六七八九十百千萬]+)\s*點/g)) {
    const v = toNum(m[2]);
    if (!(v >= 10)) continue;
    const q = m[1] ?? "";
    const ok = /逾|超/.test(q) ? v <= a && v >= a * 0.5 : /近|將近/.test(q) ? v >= a && v <= a * 1.2 : Math.abs(v - a) <= Math.max(1, a * 0.05);
    if (!ok) return `「${m[0]}」但加權指數${chg > 0 ? "漲" : "跌"} ${a.toFixed(2)} 點`;
  }
  return null;
}

/** 重點裡講「拖累／拉抬 … 點」的句子，提到的個股必須是 facts 給的權值股名單；回傳寫錯的那幾點 */
export function checkNames(points: string[], names: string[], up: string[], down: string[]): { i: number; why: string }[] {
  if (!up.length && !down.length) return [];
  const all = [...new Set(names.filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  const out: { i: number; why: string }[] = [];
  points.forEach((p, i) => {
    for (const cl of p.split(/[；;。]/)) {
      if (!/點/.test(cl)) continue;
      const isDown = /拖累|拖垮|壓抑|拉低/.test(cl), isUp = /拉抬|支撐|撐盤|支援|貢獻|護盤/.test(cl);
      if (isDown === isUp) continue; // 沒講或兩種都講，不判斷
      const ok = isDown ? down : up;
      let rest = cl;
      const found: string[] = [];
      for (const n of all) if (rest.includes(n)) { found.push(n); rest = rest.split(n).join("　"); } // 長名字先比，避免「南亞科」被當「南亞」
      const badN = found.filter((n) => !ok.includes(n));
      if (badN.length) out.push({ i, why: `「${badN.join("、")}」不在${isDown ? "拖累" : "拉抬"}名單（${ok.join("、")}）` });
    }
  });
  return out;
}

if (process.argv[1]?.includes("ai-summary")) main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
