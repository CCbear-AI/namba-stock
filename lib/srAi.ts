// 超級支撐壓力（AI 判讀版）
// 數字全部由程式先算好（均線、轉折點、缺口、成交密集區、型態），AI 只負責挑出重要價位、寫理由和總結，
// 回來的價位再檢查一次（方向對、離現價不超過 30%、對齊升降單位），避免 AI 編出不存在的數字。
import type { Bar, Level } from "./types";
import { sma } from "./indicators";
import { superLevels, toTick } from "./levels";
import { doublePatterns, swingThreshold, zigzag } from "./patterns";
import { chat, parseJson, AI_MODEL } from "./ai";

export type SrResult = { levels: Level[]; summary: string; model: string; asOf: string; price: number };

const TF_NAME: Record<string, string> = { "1d": "日K", "1wk": "週K", "1mo": "月K", "5m": "5分K", "15m": "15分K", "30m": "30分K", "60m": "60分K" };

function fmtDate(t: number, intraday: boolean) {
  const s = new Date((t + (intraday ? 8 * 3600 : 0)) * 1000).toISOString();
  return intraday ? `${s.slice(5, 10)} ${s.slice(11, 16)}` : s.slice(0, 10);
}

/** 給 AI 看的日期：10/15（不是今年的加年份 2025/10/15）；分 K 加時間 */
function mdDate(t: number, intraday: boolean, year: number) {
  const d = new Date((t + (intraday ? 8 * 3600 : 0)) * 1000);
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  const day = d.getUTCFullYear() === year ? md : `${d.getUTCFullYear()}/${md}`;
  return intraday ? `${day} ${d.toISOString().slice(11, 16)}` : day;
}

/** AI 偶爾還是寫 10-15、2026-10-15：統一改成 10/15（價格區間如 4360-4475 不動） */
export function slashDates(s: string) {
  return s
    .replace(/(?<![\d.])20\d{2}[-/](\d{1,2})[-/](\d{1,2})(?![\d.])/g, (_, m, d) => `${Number(m)}/${Number(d)}`)
    // 月-日 後面要接得像日期的字（低點、高點、缺口、收盤…），避免把 12-15 這種價格區間改掉
    .replace(/(?<![\d.])(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])(?=\s?[低高缺收跳日的兩多前後開測與及、，/）)上下起止當])/g, (_, m, d) => `${Number(m)}/${Number(d)}`);
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 整理給 AI 看的事實 */
export function srFacts(all: Bar[], tf: string) {
  const intraday = tf.endsWith("m") && tf !== "1mo";
  const bars = all.slice(-250);
  const n = bars.length;
  const last = bars[n - 1];
  const year = new Date(last.time * 1000).getUTCFullYear();
  const d = (i: number) => mdDate(bars[i].time, intraday, year);
  const closes = bars.map((b) => b.close);

  const ma: Record<string, number> = {};
  for (const k of [5, 20, 60, 120]) { const v = sma(closes, k)[n - 1]; if (v != null) ma[`MA${k}`] = r2(v); }

  const pivots = zigzag(bars, swingThreshold(bars)).slice(-12).map((p) => `${d(p.i)} ${p.kind === "H" ? "高" : "低"} ${p.price}`);

  // 未回補缺口（近 120 根）
  const gaps: string[] = [];
  for (let i = Math.max(1, n - 120); i < n; i++) {
    const p = bars[i - 1], b = bars[i];
    if (b.low > p.high) {
      const after = Math.min(...bars.slice(i + 1).map((x) => x.low), Infinity);
      const top = Math.min(b.low, after);
      if (top > p.high) gaps.push(`${d(i)} 向上跳空缺口 ${p.high}～${r2(top)}（未補）`);
    } else if (b.high < p.low) {
      const after = Math.max(...bars.slice(i + 1).map((x) => x.high), -Infinity);
      const bot = Math.max(b.high, after);
      if (bot < p.low) gaps.push(`${d(i)} 向下跳空缺口 ${r2(bot)}～${p.low}（未補）`);
    }
  }

  // 成交密集區（近 120 根，分 30 格取量最大的 4 格）
  const vb = bars.slice(-120);
  const hi = Math.max(...vb.map((b) => b.high)), lo = Math.min(...vb.map((b) => b.low));
  const bins = 30, step = (hi - lo) / bins || 1;
  const vp = new Array(bins).fill(0);
  for (const b of vb) {
    const a = Math.floor((b.low - lo) / step), z = Math.min(bins - 1, Math.floor((b.high - lo) / step));
    for (let x = a; x <= z; x++) vp[x] += b.volume / (z - a + 1);
  }
  const total = vp.reduce((s, v) => s + v, 0) || 1;
  const dense = vp.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 4)
    .map(({ v, i }) => `${r2(lo + i * step)}～${r2(lo + (i + 1) * step)}（占 ${((v / total) * 100).toFixed(0)}% 成交量）`);

  const range = (k: number) => {
    const s = bars.slice(-k);
    return `近${s.length}根 高 ${Math.max(...s.map((b) => b.high))} / 低 ${Math.min(...s.map((b) => b.low))}`;
  };

  const { patterns } = doublePatterns(bars);
  const pats = patterns.map((p) => `${p.kind === "M" ? "M頭" : "W底"}：兩個${p.kind === "M" ? "高點" : "低點"} ${p.a.price}(${d(p.a.i)})／${p.b.price}(${d(p.b.i)})，頸線 ${p.neck}，${p.broke >= 0 ? `已${p.kind === "M" ? "跌破" : "突破"}，滿足點約 ${r2(p.target)}` : `尚未${p.kind === "M" ? "跌破" : "突破"}`}`);

  const recent = bars.slice(-25).map((b, k) => `${d(n - 25 + k)} 開${b.open} 高${b.high} 低${b.low} 收${b.close} 量${Math.round(b.volume)}`);

  return {
    text: [
      `週期：${TF_NAME[tf] ?? tf}，最新一根 ${d(n - 1)}，現價 ${last.close}`,
      `均線：${Object.entries(ma).map(([k, v]) => `${k} ${v}`).join("、") || "無"}`,
      `區間：${[20, 60, 120].map(range).join("；")}`,
      `轉折點（由舊到新）：${pivots.join("；") || "無"}`,
      `未回補缺口：${gaps.slice(-5).join("；") || "無"}`,
      `成交密集區：${dense.join("；")}`,
      `型態：${pats.join("；") || "無"}`,
      `最近 25 根K線：\n${recent.join("\n")}`,
    ].join("\n"),
    price: last.close,
    asOf: fmtDate(last.time, intraday),
  };
}

const SYSTEM = `你是台灣股市的技術分析師。根據使用者提供的K線事實，判讀最重要的支撐與壓力價位。
規則：
- 只能使用提供的資料推論，不要捏造日期、價格或消息面。
- 以短中線操作為主：優先挑離現價最近、接下來最可能碰到的價位，再視情況補一個較遠的關鍵價。
- 壓力必須高於現價、支撐必須低於現價；各挑 2～3 個。
- 依據包含：均線位置、前波高低點、未回補缺口、近期收盤密集區、成交密集區、型態頸線；多種依據落在同一價位附近最重要。
- 每個價位寫一句不超過 20 字的理由，具體說出依據與日期，日期一律寫成「10/15」這種格式（例如「MA20與前高2490一帶」「10/15下跌缺口」「10/19低點，兩次測試」）。理由必須能從資料中直接驗證，例如說「缺口」就必須是資料列出的缺口。
- 依據是一段價格區間（缺口、成交密集區、多個低點形成的平台）時，加上 zone:[下緣,上緣]；單一價位就不要給 zone。
- strength：1=單一依據、2=兩種依據、3=多重依據重疊或多次測試。
- summary：用 1～2 句白話（60 字內）說明目前位置與關鍵價，繁體中文、台灣用語。
只輸出 JSON，不要其他文字，格式：
{"levels":[{"price":數字,"kind":"resistance"或"support","strength":1~3,"note":"理由","zone":[下緣,上緣]（可省略）}],"summary":"總結"}`;

export async function aiLevels(bars: Bar[], tf: string, model = AI_MODEL): Promise<SrResult> {
  const f = srFacts(bars, tf);
  const text = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: f.text }], { model, timeout: 80_000 });
  const j = parseJson<{ levels?: Partial<Level>[]; summary?: string }>(text);
  const last = f.price;
  const seen = new Set<number>();
  const levels: Level[] = [];
  for (const x of j.levels ?? []) {
    const p = Number(x.price);
    if (!Number.isFinite(p) || p <= 0 || Math.abs(p / last - 1) > 0.3) continue;
    const price = toTick(p);
    if (price === last || seen.has(price)) continue; // 對齊升降單位後等於現價的不算
    const kind: Level["kind"] = price > last ? "resistance" : "support"; // 方向以實際價位為準
    seen.add(price);
    const s = Math.round(Number(x.strength));
    // 區間：上下緣合理（包住價位附近、寬度不超過現價 6%、不跨過現價）才保留
    let zone: Level["zone"];
    const z = Array.isArray(x.zone) ? x.zone.map(Number) : [];
    if (z.length === 2 && z.every((v) => Number.isFinite(v) && v > 0)) {
      const lo = Math.min(z[0], z[1]), hi = Math.max(z[0], z[1]);
      if (hi > lo && hi - lo <= last * 0.06 && price >= lo * 0.99 && price <= hi * 1.01 && (kind === "resistance" ? lo > last : hi < last)) zone = [lo, hi];
    }
    levels.push({ kind, price, strength: (s >= 3 ? 3 : s <= 1 ? 1 : 2) as Level["strength"], note: slashDates(String(x.note ?? "")).slice(0, 40), ...(zone ? { zone } : {}) });
  }
  if (!levels.length) throw new Error("AI 沒有給出可用的價位");
  levels.sort((a, b) => b.price - a.price);
  return { levels, summary: slashDates(String(j.summary ?? "")).slice(0, 200), model, asOf: f.asOf, price: last };
}

/** AI 不能用時的退路：原本的程式計算版 */
export function formulaLevels(bars: Bar[], tf: string): SrResult {
  const intraday = tf.endsWith("m") && tf !== "1mo";
  const r = superLevels(bars);
  const last = bars[bars.length - 1];
  return { ...r, model: "formula", asOf: last ? fmtDate(last.time, intraday) : "", price: last?.close ?? 0 };
}
