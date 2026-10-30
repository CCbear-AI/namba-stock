// 自選股收盤報告：一個自選群組在最新交易日的重點（漲跌、量能、法人、融資、分點、隔日沖、重大訊息）。
// 數字全部由程式從盤後資料算，AI 只負責把重點寫成幾句話；背景推播用的一句話（brief）不用 AI
import { getChips, getDaily } from "./history";
import { getBrokerDays, shortName } from "./brokers";
import { clsOf, CLS_NAME } from "./brokerCls";
import { dtView } from "./brokerFlow";
import { newsFor, type News } from "./news";
import { BY_CODE } from "./universe";
import { ETFS } from "./etfs";
import { chat, parseJson } from "./ai";

export type WlRow = {
  c: string; n: string; close: number; pct: number; pct5: number;
  rv: number | null; // 成交量 ÷ 前 20 日均量
  ma: "above" | "below" | "mid" | null; // 站上月線季線／跌破／中間
  f: number | null; t: number | null; // 外資、投信買賣超（張）
  mg: number | null; // 融資增減（張）
  top?: { b: string; lots: number; cls: string }; // 當天買超最多的分點
  dt?: { pct: number; who: string[] }; // 隔日沖分點大買（佔 20 日均量 %）
  dump?: number; // 昨天隔日沖買的今天倒了幾 %
};
export type WlReport = { date: string; brokers: boolean; rows: WlRow[]; news: News[]; up: number; down: number; avg: number };

const r1 = (v: number) => Math.round(v * 10) / 10;
const pc = (a: number, b: number) => (a > 0 && b > 0 ? (a / b - 1) * 100 : 0);
const nameOf = (c: string) => BY_CODE.get(c)?.n ?? ETFS[c] ?? c;

export function wlFacts(codesIn: string[]): WlReport | { error: string } {
  const codes = [...new Set(codesIn)].slice(0, 40);
  const { dates, s } = getDaily();
  const i = dates.length - 1;
  const date = dates[i];
  if (!date) return { error: "還沒有盤後資料" };
  const chips = getChips();
  const ch = chips.at(-1)?.date === date ? chips.at(-1)! : null, chPrev = ch ? chips.at(-2) : null;
  const bd = getBrokerDays();
  const day = bd.days.at(-1)?.date === date ? bd.days.at(-1)! : null;
  const dt = day ? dtView() : null;
  const dtToday = new Map(dt && !("error" in dt) ? dt.today.map((r) => [r.c, r]) : []);
  const dtDump = new Map(dt && !("error" in dt) ? dt.dumped.map((r) => [r.c, r]) : []);

  const rows: WlRow[] = [];
  for (const c of codes) {
    const x = s.get(c);
    const close = x?.c[i];
    if (!x || !(close! > 0)) continue;
    const v = x.v.slice(Math.max(0, i - 20), i).filter((y) => y > 0);
    const avg = v.length >= 5 ? v.reduce((a, y) => a + y, 0) / v.length : 0;
    const cs = x.c.slice(0, i + 1).filter((y) => y > 0);
    const ma = (n: number) => (cs.length >= n ? cs.slice(-n).reduce((a, y) => a + y, 0) / n : 0);
    const m20 = ma(20), m60 = ma(60);
    const cur = ch?.s[c], prev = chPrev?.s[c];
    const row: WlRow = {
      c, n: nameOf(c), close: close!, pct: r1(pc(close!, x.c[i - 1])), pct5: r1(pc(close!, x.c[i - 5])),
      rv: avg && x.v[i] > 0 ? Math.round((x.v[i] / avg) * 10) / 10 : null,
      ma: m20 && m60 ? (close! > m20 && close! > m60 ? "above" : close! < m20 && close! < m60 ? "below" : "mid") : null,
      f: cur ? cur[0] : null, t: cur ? cur[1] : null,
      mg: cur?.[3] && prev?.[3] ? cur[3] - prev[3] : null,
    };
    const b = day?.s.get(c);
    if (b) {
      const best = b.rows.map(([id, bb, ss]) => ({ id, net: bb - ss })).sort((p, q) => q.net - p.net)[0];
      if (best && best.net > 0) row.top = { b: shortName(bd.names.get(best.id) ?? best.id), lots: best.net, cls: CLS_NAME[clsOf(best.id)] };
    }
    const d1 = dtToday.get(c);
    if (d1 && d1.pct >= 10) row.dt = { pct: d1.pct, who: d1.who };
    const d2 = dtDump.get(c);
    if (d2 && d2.ratio >= 50) row.dump = d2.ratio;
    rows.push(row);
  }
  // 重大訊息：前一個交易日以後公告的（開放資料晚一天才出來）
  const news = newsFor(rows.map((r) => r.c), dates[i - 1] ?? date).filter((x) => (x.imp ?? 2) >= 2).slice(0, 20);
  return {
    date, brokers: !!day, rows, news,
    up: rows.filter((r) => r.pct > 0).length, down: rows.filter((r) => r.pct < 0).length,
    avg: rows.length ? r1(rows.reduce((a, r) => a + r.pct, 0) / rows.length) : 0,
  };
}

const sg = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const lots = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString()}`;

/** 給 AI 的事實清單 */
function factText(r: WlReport, group: string) {
  const L = [`自選群組「${group}」${r.rows.length} 檔，${r.date} 收盤：漲 ${r.up}、跌 ${r.down}，平均 ${sg(r.avg)}%${r.brokers ? "" : "（分點資料晚上才出來，這份還沒有分點）"}`];
  for (const x of [...r.rows].sort((a, b) => b.pct - a.pct)) {
    const p = [`${x.n}(${x.c}) ${x.close} ${sg(x.pct)}%，5日${sg(x.pct5)}%`];
    if (x.rv != null && (x.rv >= 1.8 || x.rv <= 0.5)) p.push(`量是均量${x.rv}倍`);
    if (x.ma) p.push(x.ma === "above" ? "站上月線季線" : x.ma === "below" ? "跌破月線季線" : "月線季線之間");
    if (x.f != null && x.t != null && (Math.abs(x.f) >= 500 || Math.abs(x.t) >= 200)) p.push(`外資${lots(x.f)}張、投信${lots(x.t)}張`);
    if (x.mg != null && Math.abs(x.mg) >= 300) p.push(`融資${lots(x.mg)}張`);
    if (x.top && x.top.lots >= 300) p.push(`買超第一${x.top.b}(${x.top.cls})${x.top.lots.toLocaleString()}張`);
    if (x.dt) p.push(`隔日沖分點大買佔均量${x.dt.pct.toFixed(0)}%（${x.dt.who.join("、")}），明天可能有賣壓`);
    if (x.dump) p.push(`昨天隔日沖買的今天倒了${x.dump.toFixed(0)}%`);
    L.push(p.join("，"));
  }
  if (r.news.length) L.push(`重大訊息：${r.news.map((x) => `${x.n} ${x.d.slice(5)}「${x.sum || x.title}」`).join("；")}`);
  return L.join("\n");
}

const SYSTEM = `你是台股看盤助理，幫使用者整理他的自選股收盤報告。使用者會給你程式算好的事實。
規則：
- 只能用提供的數字與名稱，不要捏造新聞、原因或沒給的數字；推論用「可能」「顯示」等保守說法。
- 繁體中文、台灣用語、白話，不要給買賣建議。
- 挑最值得注意的事寫，不要逐檔流水帳：漲跌特別大的、量特別大的、法人或主力分點大買大賣的、隔日沖大買（明天可能有賣壓）的、有重大訊息的。
只輸出 JSON：{"headline":"25字內標題","points":["重點1","重點2","重點3"]}
points 3～5 點，每點 60 字內。`;

export async function wlAi(r: WlReport, group: string) {
  const j = parseJson<{ headline: string; points: string[] }>(await chat([{ role: "system", content: SYSTEM }, { role: "user", content: factText(r, group) }], { timeout: 240_000 }));
  if (!j.headline || !Array.isArray(j.points) || !j.points.length) throw new Error("AI 回覆格式不對");
  return { headline: String(j.headline).slice(0, 60), points: j.points.slice(0, 5).map((p) => String(p).slice(0, 120)) };
}

/** 推播用的一句話（不用 AI）：漲跌家數、最強最弱、法人大買、隔日沖、重大訊息 */
export function brief(r: WlReport, group: string) {
  const s = [...r.rows].sort((a, b) => b.pct - a.pct);
  const parts = [`${group} ${r.rows.length} 檔：漲 ${r.up} 跌 ${r.down}`];
  if (s[0] && s[0].pct > 0) parts.push(`最強 ${s[0].n} ${sg(s[0].pct)}%`);
  const w = s.at(-1);
  if (w && w.pct < 0) parts.push(`最弱 ${w.n} ${sg(w.pct)}%`);
  const inst = [...r.rows].filter((x) => x.f != null).sort((a, b) => (b.f! + b.t!) - (a.f! + a.t!))[0];
  if (inst && inst.f! + inst.t! >= 500) parts.push(`法人大買 ${inst.n}`);
  const dt = r.rows.filter((x) => x.dt);
  if (dt.length) parts.push(`隔日沖大買 ${dt.slice(0, 2).map((x) => x.n).join("、")}`);
  if (r.news.length) parts.push(`重大訊息 ${r.news.length} 則`);
  return parts.join("，");
}
