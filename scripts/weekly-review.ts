// 一週回顧：週末把這週的大盤、族群、法人、期貨、融資、千張大戶、每天的盤後重點／國際焦點／重大訊息整理好，
// 交給學校 AI 寫重點；下週法說會由程式從重大訊息挑出。存到 data/weekly/這週最後交易日.json，首頁顯示最新一份，寫好推播。
// 用法：npm run weekly-review [-- --force 平日也寫、已寫過也重寫 | --no-push]
// （daily-data 週六集保那次跑、world-focus 週日早上再跑一次當備援；只在週六、日寫，同一週寫過就略過）
import fs from "node:fs";
import path from "node:path";
import { getChips, getDaily, getFutures, getTdcc } from "@/lib/history";
import { taiexDaily, sectorDaily } from "@/lib/sector";
import { newsDates, readNewsDay } from "@/lib/news";
import { THEMES } from "@/lib/themes";
import { BY_CODE } from "@/lib/universe";
import { aiReady, chat, parseJson, AI_MODEL } from "@/lib/ai";
import { pushReady, pushKind } from "@/lib/pushServer";
import type { Bar } from "@/lib/types";

const DATA = path.join(process.cwd(), "data");
const OUT = path.join(DATA, "weekly");
const sign = (v: number, d = 2) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const readJson = <T,>(f: string): T | null => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);

type Call = { c: string; n: string; d: string; text: string };

/** 這週（最後交易日所在的週一～週五）在 dates 裡的範圍，與上週最後一天 */
function weekRange(dates: string[]) {
  const last = dates.at(-1)!;
  const dt = new Date(`${last}T00:00:00Z`);
  const mon = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
  const days = dates.filter((d) => d >= mon);
  const prev = dates.filter((d) => d < mon).at(-1)!;
  return { mon, last, days, prev };
}

/** 週 K 摘要：本週收盤、漲跌、量比上週 */
function weekOf(bars: Bar[], prev: string, days: string[]) {
  const by = new Map(bars.map((b) => [day(b.time), b]));
  const p = by.get(prev), w = days.map((d) => by.get(d)).filter((b): b is Bar => !!b);
  if (!p || !w.length) return null;
  const close = w.at(-1)!.close;
  const vol = w.reduce((a, b) => a + b.volume, 0) / w.length;
  const prevDays = bars.filter((b) => day(b.time) <= prev).slice(-5);
  const pvol = prevDays.reduce((a, b) => a + b.volume, 0) / (prevDays.length || 1);
  const closes = bars.filter((b) => day(b.time) <= days.at(-1)!).map((b) => b.close);
  const ma = (n: number) => closes.slice(-n).reduce((a, x) => a + x, 0) / Math.min(n, closes.length);
  return { close, chg: close - p.close, pct: (close / p.close - 1) * 100, high: Math.max(...w.map((b) => b.high)), low: Math.min(...w.map((b) => b.low)), volRatio: pvol ? vol / pvol : 0, ma20: ma(20), ma60: ma(60) };
}

/** 從重大訊息找下週要開法說會的公司（日期寫在摘要或主旨裡，民國 115/11/03、11/03、11月3日 都認） */
function nextWeekCalls(mon: string): Call[] {
  const start = new Date(new Date(`${mon}T00:00:00Z`).getTime() + 7 * 86400e3).toISOString().slice(0, 10);
  const end = new Date(new Date(`${start}T00:00:00Z`).getTime() + 6 * 86400e3).toISOString().slice(0, 10);
  const year = Number(start.slice(0, 4));
  const out = new Map<string, Call>();
  for (const d of newsDates().slice(-15)) for (const x of readNewsDay(d).items) {
    if (x.rep || !(x.tag === "法說會" || /法人說明會|法說會|業績說明會/.test(x.title))) continue;
    const s = `${x.sum ?? ""} ${x.title}`;
    const m = s.match(/(\d{3})[/.年](\d{1,2})[/.月](\d{1,2})/) ?? s.match(/(?<![\d/])()(\d{1,2})[/月](\d{1,2})日?/);
    if (!m) continue;
    const y = m[1] ? Number(m[1]) + 1911 : year;
    const dd = `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    if (dd < start || dd > end) continue;
    out.set(`${x.c}|${dd}`, { c: x.c, n: x.n, d: dd, text: (x.sum || x.title).slice(0, 60) });
  }
  return [...out.values()].sort((a, b) => a.d.localeCompare(b.d) || a.c.localeCompare(b.c));
}

async function facts() {
  const { dates, s } = getDaily();
  const { mon, last, days, prev } = weekRange(dates);
  const L: string[] = [`本週：${md(days[0])}～${md(last)}（${days.length} 個交易日），上週收盤日 ${md(prev)}`];
  const stats: Record<string, unknown> = {};

  const [tx, otc] = await Promise.all([taiexDaily(), sectorDaily("o00").catch(() => [] as Bar[])]);
  const t = weekOf(tx, prev, days), o = weekOf(otc, prev, days);
  if (t) {
    stats.taiex = { close: t.close, chg: Math.round(t.chg * 100) / 100, pct: Math.round(t.pct * 100) / 100 };
    L.push(`加權指數：週收 ${t.close.toFixed(2)}（${sign(t.chg)} 點，${sign(t.pct)}%），週高 ${t.high.toFixed(0)}、週低 ${t.low.toFixed(0)}；日均量是上週的 ${t.volRatio.toFixed(2)} 倍；收盤${t.close > t.ma20 ? "在" : "跌破"}月線（${t.ma20.toFixed(0)}）、${t.close > t.ma60 ? "在" : "跌破"}季線（${t.ma60.toFixed(0)}）`);
  }
  if (o) {
    stats.otc = { close: o.close, chg: Math.round(o.chg * 100) / 100, pct: Math.round(o.pct * 100) / 100 };
    L.push(`櫃買指數：週收 ${o.close.toFixed(2)}（${sign(o.pct)}%）`);
  }

  // 個股週漲跌（上週收盤 → 本週收盤），成交值單位百萬
  const pi = dates.indexOf(prev), li = dates.length - 1;
  const rows = [...s].map(([c, x]) => {
    const p = x.c[pi], c1 = x.c[li];
    const val = x.val.slice(pi + 1, li + 1).reduce((a, v) => a + (v || 0), 0);
    return { c, n: BY_CODE.get(c)?.n ?? c, pct: p > 0 && c1 > 0 ? (c1 / p - 1) * 100 : NaN, val };
  }).filter((r) => Number.isFinite(r.pct) && BY_CODE.has(r.c));
  const pct = new Map(rows.map((r) => [r.c, r.pct]));
  const th = Object.entries(THEMES).map(([n, cs]) => {
    const v = cs.map((k) => pct.get(k)).filter((x): x is number => x != null);
    return { n, p: v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0, k: v.length };
  }).filter((x) => x.k >= 3).sort((a, b) => b.p - a.p);
  stats.themesUp = th.slice(0, 5).map((x) => ({ n: x.n, pct: Math.round(x.p * 10) / 10 }));
  stats.themesDown = th.slice(-5).reverse().map((x) => ({ n: x.n, pct: Math.round(x.p * 10) / 10 }));
  L.push(`族群週漲幅前五：${th.slice(0, 5).map((x) => `${x.n}(${sign(x.p, 1)}%)`).join("、")}；後五：${th.slice(-5).reverse().map((x) => `${x.n}(${sign(x.p, 1)}%)`).join("、")}`);
  const byVal = [...rows].sort((a, b) => b.val - a.val);
  L.push(`本週成交值前十：${byVal.slice(0, 10).map((r) => `${r.n}(${Math.round(r.val / 100)}億，${sign(r.pct, 1)}%)`).join("、")}`);
  const big = rows.filter((r) => r.val / days.length >= 500); // 日均成交 5 億以上
  L.push(`日均成交5億以上週漲幅前五：${[...big].sort((a, b) => b.pct - a.pct).slice(0, 5).map((r) => `${r.n}(${sign(r.pct, 1)}%)`).join("、")}；週跌幅前五：${[...big].sort((a, b) => a.pct - b.pct).slice(0, 5).map((r) => `${r.n}(${sign(r.pct, 1)}%)`).join("、")}`);

  // 法人（億）、融資
  const chips = getChips();
  const wk = chips.filter((d) => days.includes(d.date));
  if (wk.length) {
    const sum = (k: string) => wk.reduce((a, d) => a + (d.m[k] ?? 0), 0);
    const f = sum("f"), tt = sum("t"), dd = sum("d");
    stats.insti = { f: Math.round(f * 10) / 10, t: Math.round(tt * 10) / 10, d: Math.round(dd * 10) / 10 };
    L.push(`三大法人本週（${wk.length} 天）：外資 ${sign(f, 1)} 億、投信 ${sign(tt, 1)} 億、自營商 ${sign(dd, 1)} 億，合計 ${sign(f + tt + dd, 1)} 億`);
    const marginAt = (upTo: string) => chips.filter((d) => d.date <= upTo && d.m.marginAmt > 0).at(-1);
    const m1 = marginAt(last), m0 = marginAt(prev);
    if (m1 && m0) L.push(`融資餘額 ${m1.m.marginAmt.toFixed(1)} 億（${md(m1.date)}），比上週 ${sign(m1.m.marginAmt - m0.m.marginAmt, 1)} 億`);
    // 外資買賣超前五（張，本週加總）
    const acc = new Map<string, number>();
    for (const d of wk) for (const [c, v] of Object.entries(d.s)) if (BY_CODE.has(c)) acc.set(c, (acc.get(c) ?? 0) + (v[0] ?? 0));
    const fx = [...acc].sort((a, b) => b[1] - a[1]);
    const nm = ([c, v]: [string, number]) => `${BY_CODE.get(c)!.n}(${sign(v, 0)}張)`;
    L.push(`外資本週買超前五：${fx.slice(0, 5).map(nm).join("、")}；賣超前五：${fx.slice(-5).reverse().map(nm).join("、")}`);
  }
  const fut = getFutures();
  const f1 = fut[last] ?? fut[Object.keys(fut).filter((d) => d <= last).sort().at(-1) ?? ""], f0 = fut[prev];
  if (f1 && f0) {
    stats.fut = { tx: f1.tx[0], chg: f1.tx[0] - f0.tx[0] };
    // 直接寫多空方向，AI 才不會把「淨空單增加」寫成「淨增」
    const side = (v: number) => (v < 0 ? `淨空單 ${(-v).toLocaleString()} 口` : `淨多單 ${v.toLocaleString()} 口`);
    const d = f1.tx[0] - f0.tx[0];
    L.push(`外資台指期未平倉：${side(f1.tx[0])}（上週${side(f0.tx[0])}），${d < 0 ? "空單增加或多單減少" : "空單減少或多單增加"} ${Math.abs(d).toLocaleString()} 口`);
  }

  // 千張大戶（集保每週五資料，週六公布）：日均成交前 300 檔裡變化最大的
  const td = getTdcc().filter((x) => x.date > prev && x.date <= last).at(-1);
  const tdPrev = td && getTdcc().filter((x) => x.date < td.date).at(-1);
  if (td && tdPrev) {
    const top = new Set(byVal.slice(0, 300).map((r) => r.c));
    const ch = Object.entries(td.s).filter(([c]) => top.has(c) && tdPrev.s[c]).map(([c, v]) => ({ c, d: v[0] - tdPrev.s[c][0] })).sort((a, b) => b.d - a.d);
    const nm = (x: { c: string; d: number }) => `${BY_CODE.get(x.c)?.n ?? x.c}(${sign(x.d, 2)})`;
    const up = ch.filter((x) => x.d > 0).length;
    L.push(`千張大戶持股（集保 ${md(td.date)} vs ${md(tdPrev.date)}，成交值前 300 檔）：${up} 檔增加、${ch.length - up} 檔減少；增加最多：${ch.slice(0, 5).map(nm).join("、")}；減少最多：${ch.slice(-5).reverse().map(nm).join("、")}`);
  } else L.push("千張大戶：本週集保資料還沒進來");

  // 這週每天的盤後重點、國際焦點、重大訊息（給 AI 挑大事）
  L.push("", "本週每日盤後重點：");
  for (const d of days) { const j = readJson<{ headline: string; points: string[] }>(path.join(DATA, "summary", `${d}.json`)); if (j) L.push(`- ${md(d)} ${j.headline}：${j.points.slice(0, 2).join("；")}`); }
  L.push("", "本週國際焦點：");
  const wdir = path.join(DATA, "world");
  for (const f of fs.existsSync(wdir) ? fs.readdirSync(wdir).filter((f) => f.slice(0, 10) >= mon && /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort() : []) {
    const j = readJson<{ headline: string; points: { t: string; text: string }[] }>(path.join(wdir, f));
    if (j) L.push(`- ${md(f)} ${j.headline}：${j.points.map((p) => p.t).join("、")}`);
  }
  const cap = (c: string) => (BY_CODE.get(c)?.sh ?? 0) * (s.get(c)?.c[li] ?? 0);
  const imp = newsDates().filter((d) => d >= mon).flatMap((d) => readNewsDay(d).items).filter((x) => !x.rep && x.imp === 3 && x.sum).sort((a, b) => cap(b.c) - cap(a.c)).slice(0, 12);
  L.push("", "本週重要公司公告（市值大的在前）：", ...imp.map((x) => `- ${md(x.d)} ${x.n}：${x.sum}`));

  const calls = nextWeekCalls(mon).sort((a, b) => cap(b.c) - cap(a.c)).slice(0, 20).sort((a, b) => a.d.localeCompare(b.d));
  if (calls.length) L.push("", "下週法說會：", ...calls.map((x) => `- ${md(x.d)} ${x.n}`));
  return { date: last, from: days[0], text: L.join("\n"), stats, calls };
}

const SYSTEM = `你是台股週報編輯，替散戶寫「一週回顧」。根據使用者提供的本週數據、每日重點與公告，寫出這週最重要的事。
規則：
- 只能使用提供的數字與內容，不要捏造新聞、原因或沒給的數字；推論用「可能」「顯示」等保守說法。
- 繁體中文、台灣用語、白話，不要給買賣建議。
- 國際焦點裡的美股、台積電 ADR 漲跌不是台股個股的漲跌，台股個股表現以本週成交值、漲跌幅資料為準。
- points 4～6 點，每點 60 字內，依序涵蓋：大盤週表現、資金集中的族群、法人與期貨籌碼、千張大戶或融資的變化、本週最重要的一兩件大事（公司或國際）。
- watch 寫下週可留意的一句話（50 字內），可以提到下週法說會的大公司。
只輸出 JSON：{"headline":"20字內標題","points":["…"],"watch":"…"}`;

async function main() {
  const force = process.argv.includes("--force");
  const wd = new Date(Date.now() + 8 * 3600e3).getUTCDay();
  if (!force && wd !== 6 && wd !== 0) { console.log("週六、日才寫一週回顧，略過"); return; }
  if (!aiReady()) { console.log("沒有 IAI_API_KEY，略過"); return; }
  const f = await facts();
  const file = path.join(OUT, `${f.date}.json`);
  if (fs.existsSync(file) && !force) { console.log(`這週（${f.date}）已經寫過，略過`); return; }
  console.log(f.text);
  let lastErr: unknown;
  for (let k = 0; k < 3; k++) {
    try {
      const j = parseJson<{ headline: string; points: string[]; watch?: string }>(await chat([{ role: "system", content: SYSTEM }, { role: "user", content: f.text }], { timeout: 240_000, maxTokens: 16000 }));
      if (!j.headline || !Array.isArray(j.points) || j.points.length < 3) throw new Error("格式不對");
      fs.mkdirSync(OUT, { recursive: true });
      const out = { date: f.date, from: f.from, generated: Date.now(), model: AI_MODEL, headline: j.headline, points: j.points.slice(0, 6), watch: j.watch ?? "", stats: f.stats, calls: f.calls, facts: f.text };
      fs.writeFileSync(file, JSON.stringify(out, null, 1));
      console.log(`\n${out.headline}\n- ${out.points.join("\n- ")}\n下週：${out.watch}`);
      if (pushReady && !process.argv.includes("--no-push")) {
        try { console.log("一週回顧推播", await pushKind("weekly", { title: `一週回顧 ${md(f.from)}～${md(f.date)}`, body: out.headline, url: "/#weekly", tag: `weekly${f.date}` }), "則"); }
        catch (e) { console.error("推播失敗", (e as Error).message); }
      }
      return;
    } catch (e) { lastErr = e; console.log(`第 ${k + 1} 次失敗：${(e as Error).message}`); await new Promise((r) => setTimeout(r, 20_000)); }
  }
  throw lastErr;
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
