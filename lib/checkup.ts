// 個股一眼體檢：燈號全部由程式用盤後資料算（日K、法人、融資、集保、分點換手、支撐壓力、月營收），
// AI 只根據這些燈號寫一句總結（/api/checkup），不讓 AI 自己編數字。
import { getChips, getDaily, getTdcc } from "./history";
import { getBars } from "./bars";
import { stockHandoff } from "./brokerFlow";
import { superLevels } from "./levels";
import { chat, parseJson } from "./ai";
import { ETFS } from "./etfs";
import type { Bar } from "./types";
import { readDigests, type Digest } from "./stockNews";

/** g＝偏好、y＝留意、r＝偏弱、n＝沒資料或只是參考 */
export type Lv = "g" | "y" | "r" | "n";
export type Light = { k: string; name: string; lv: Lv; text: string };
export type Checkup = { code: string; date: string; close: number; lights: Light[]; good: number; bad: number; verdict: string };

const r1 = (v: number) => Math.round(v * 10) / 10;
const sg = (v: number, d = 0) => `${v > 0 ? "+" : ""}${d ? v.toFixed(d) : Math.round(v).toLocaleString()}`;

function smaAt(c: number[], n: number, e: number) {
  if (e + 1 < n) return NaN;
  let s = 0;
  for (let i = e - n + 1; i <= e; i++) s += c[i];
  return s / n;
}

function rsi(c: number[], n = 14) {
  if (c.length <= n) return NaN;
  let up = 0, dn = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) up += d; else dn -= d; }
  up /= n; dn /= n;
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    up = (up * (n - 1) + Math.max(d, 0)) / n;
    dn = (dn * (n - 1) + Math.max(-d, 0)) / n;
  }
  return dn ? 100 - 100 / (1 + up / dn) : 100;
}

/** 連買（正）／連賣（負）天數 */
function streak(vals: number[]) {
  let s = 0;
  for (let i = vals.length - 1; i >= 0; i--) {
    const v = vals[i];
    if (!v) break;
    if (s === 0) s = v > 0 ? 1 : -1;
    else if ((v > 0) !== (s > 0)) break;
    else s += s > 0 ? 1 : -1;
  }
  return s;
}

/** 月營收年增率（FinMind，跟基本面卡同一個來源；抓不到就略過這顆燈） */
async function revenueYoy(code: string): Promise<{ ym: string; yoy: number } | null> {
  try {
    const token = process.env.FINMIND_TOKEN?.trim();
    const start = new Date(Date.now() - 430 * 864e5).toISOString().slice(0, 10);
    const r = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockMonthRevenue&data_id=${code}&start_date=${start}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      next: { revalidate: 6 * 3600 },
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    const rows = (j.data ?? []) as { revenue_year: number; revenue_month: number; revenue: number }[];
    const L = rows.at(-1);
    const ly = L && rows.find((x) => x.revenue_year === L.revenue_year - 1 && x.revenue_month === L.revenue_month);
    if (!L || !ly?.revenue) return null;
    return { ym: `${L.revenue_month}月`, yoy: r1((L.revenue / ly.revenue - 1) * 100) };
  } catch {
    return null;
  }
}

/** opts.rev：批次時先抓好全市場月營收（官方開放資料），不逐檔問 FinMind；opts.batch：不用即時報價；opts.digest：個股新聞 AI 近一週重點 */
export async function checkup(code: string, opts: { rev?: Map<string, { ym: string; yoy: number }>; batch?: boolean; digest?: Digest | null } = {}): Promise<Checkup | { error: string }> {
  // 日K用 getBars（官方日K＋更早的 Yahoo，ETF 官方日K只有最近幾天），只取到最新一份盤後資料那天，盤中燈號不跟著跳
  const { dates } = getDaily();
  const end = Date.parse(dates.at(-1) ?? "") / 1000;
  const bars = (await getBars(code, "1d", { live: !opts.batch }).catch(() => [] as Bar[])).filter((b) => b.time <= end && b.close > 0);
  if (bars.length < 61) return { error: `${code} 日K資料不夠，無法體檢` };
  const c = bars.map((b) => b.close);
  const n = c.length - 1;
  const close = c[n];
  const date = new Date(bars[n].time * 1000).toISOString().slice(0, 10);
  const lights: Light[] = [];

  // 1. 趨勢：月線、季線與月線方向
  {
    const m20 = smaAt(c, 20, n), m60 = smaAt(c, 60, n), m20p = smaAt(c, 20, n - 5);
    const upSlope = m20 > m20p;
    const above20 = close > m20, above60 = close > m60;
    const lv: Lv = above20 && above60 && upSlope ? "g" : !above20 && !above60 && !upSlope ? "r" : "y";
    const pos = above20 && above60 ? "站上月線、季線" : !above20 && !above60 ? "跌破月線、季線" : above20 ? "站上月線、在季線下" : "跌破月線、還在季線上";
    lights.push({ k: "trend", name: "趨勢", lv, text: `${pos}，月線${upSlope ? "上彎" : "下彎"}` });
  }

  // 2. 動能：RSI14、月線乖離、近 20 日漲跌
  {
    const r = rsi(c.slice(-120)), bias = (close / smaAt(c, 20, n) - 1) * 100, ret20 = (close / c[n - 20] - 1) * 100;
    const lv: Lv = bias >= 15 || r >= 80 ? "y" : r >= 50 ? "g" : r < 35 ? "r" : "y";
    const tag = bias >= 15 || r >= 80 ? "短線漲多，" : r < 30 ? "跌深，" : "";
    lights.push({ k: "mom", name: "動能", lv, text: `${tag}RSI ${Math.round(r)}、月線乖離 ${sg(bias, 1)}%、20日 ${sg(ret20, 1)}%` });
  }

  // 3. 法人：外資＋投信近 5 日買賣超佔成交量
  const chips = getChips();
  const cur = chips.at(-1)?.s[code];
  {
    const last5 = chips.slice(-5).map((d) => d.s[code]);
    if (!cur || last5.some((x) => !x)) lights.push({ k: "inst", name: "法人", lv: "n", text: "沒有法人資料" });
    else {
      const f = last5.reduce((a, x) => a + x![0], 0), t = last5.reduce((a, x) => a + x![1], 0);
      const vol = bars.slice(-5).reduce((a, b) => a + b.volume, 0);
      const ratio = vol ? ((f + t) / vol) * 100 : 0;
      const fs = streak(chips.map((d) => d.s[code]?.[0] ?? 0)), ts = streak(chips.map((d) => d.s[code]?.[1] ?? 0));
      const st = (x: number, who: string) => (Math.abs(x) >= 3 ? `，${who}連${x > 0 ? "買" : "賣"} ${Math.abs(x)} 天` : "");
      const lv: Lv = ratio >= 2 ? "g" : ratio <= -2 ? "r" : "y";
      lights.push({ k: "inst", name: "法人", lv, text: `近5日外資 ${sg(f)} 張、投信 ${sg(t)} 張（佔成交量 ${sg(ratio, 1)}%）${st(fs, "外資")}${st(ts, "投信")}` });
    }
  }

  // 4. 融資：近 5 日融資增減 vs 股價漲跌
  {
    // 融資券約 21:00 才公布：最新一天還沒公布（全市場都是 0）就用前一次
    let mi = chips.length - 1;
    while (mi > 0 && !Object.values(chips[mi].s).some((v) => v[3] > 0)) mi--;
    const cur = chips[mi]?.s[code], p5 = chips[mi - 5]?.s[code];
    if (!cur || !p5 || !cur[3] || !p5[3]) lights.push({ k: "margin", name: "融資", lv: "n", text: "沒有融資（或不能融資）" });
    else {
      const chg = (cur[3] / p5[3] - 1) * 100, px = (close / c[n - 5] - 1) * 100;
      const use = cur[5] ? (cur[3] / cur[5]) * 100 : null;
      let lv: Lv = "y", why = "";
      if (chg >= 3 && px < 0) { lv = "r"; why = "股價跌、融資反而增加（散戶接刀）"; }
      else if (chg >= 8 && px > 0) { lv = "y"; why = "融資跟著大增，籌碼變亂"; }
      else if (chg <= -3 && px >= 0) { lv = "g"; why = "股價漲、融資減少（籌碼沉澱）"; }
      else if (use != null && use >= 50) { lv = "y"; why = "融資使用率偏高"; }
      lights.push({ k: "margin", name: "融資", lv, text: `${why ? `${why}，` : ""}近5日融資 ${sg(chg, 1)}%、股價 ${sg(px, 1)}%${use != null ? `、使用率 ${use.toFixed(0)}%` : ""}` });
    }
  }

  // 5. 大戶：千張大戶持股週變化
  {
    const tdcc = getTdcc();
    const t1 = tdcc.at(-1)?.s[code], t0 = tdcc.at(-2)?.s[code];
    if (!t1 || !t0) lights.push({ k: "big", name: "大戶", lv: "n", text: "沒有集保資料" });
    else {
      const d = t1[0] - t0[0], h = t1[1] - t0[1];
      const lv: Lv = d >= 0.3 ? "g" : d <= -0.3 ? "r" : "y";
      lights.push({ k: "big", name: "大戶", lv, text: `千張大戶 ${t1[0].toFixed(1)}%（本週 ${sg(d, 2)}），股東人數 ${sg(h)}` });
    }
  }

  // 6. 分點：這週安定／浮動籌碼換手
  {
    const h = code.startsWith("00") ? null : stockHandoff(code);
    if (!h || !h.gross) lights.push({ k: "broker", name: "分點", lv: "n", text: "沒有分點資料（成交值太小或是 ETF）" });
    else {
      const lv: Lv = h.score >= 20 ? "g" : h.score <= -20 ? "r" : "y";
      const who = lv === "r" ? (h.leadF ? `，短線分點 ${h.leadF} 買最多` : "") : h.lead ? `，${h.lead} 買最多` : "";
      lights.push({ k: "broker", name: "分點", lv, text: `這週${h.label}（分數 ${sg(h.score)}）${who}` });
    }
  }

  // 7. 營收：最新月營收年增
  if (!ETFS[code] && !code.startsWith("00")) {
    const rv = opts.rev ? opts.rev.get(code) ?? null : await revenueYoy(code);
    if (!rv) lights.push({ k: "rev", name: "營收", lv: "n", text: "月營收抓不到" });
    else lights.push({ k: "rev", name: "營收", lv: rv.yoy >= 10 ? "g" : rv.yoy <= -10 ? "r" : "y", text: `${rv.ym}營收年增 ${sg(rv.yoy, 1)}%` });
  }

  // 8. 消息面：個股新聞 AI 近一週重點（7 天內才算）
  {
    const dg = opts.digest === undefined ? readDigests()[code] : opts.digest;
    if (dg && Date.now() - dg.at < 7 * 86400e3) lights.push({ k: "news", name: "消息面", lv: dg.tone === "多" ? "g" : dg.tone === "空" ? "r" : "y", text: dg.text });
  }

  // 9. 支撐壓力（只當參考，不算分）：程式計算版最近的上下價位
  {
    const lv = superLevels(bars).levels;
    const res = lv.filter((l) => l.price > close).sort((a, b) => a.price - b.price)[0];
    const sup = lv.filter((l) => l.price < close).sort((a, b) => b.price - a.price)[0];
    const d = (p: number) => sg((p / close - 1) * 100, 1);
    const parts = [res && `上方壓力 ${res.price}（${d(res.price)}%）`, sup && `下方支撐 ${sup.price}（${d(sup.price)}%）`].filter(Boolean);
    lights.push({ k: "sr", name: "支撐壓力", lv: "n", text: parts.join("、") || "附近沒有明顯價位" });
  }

  const good = lights.filter((l) => l.lv === "g").length, bad = lights.filter((l) => l.lv === "r").length;
  const verdict = good - bad >= 3 ? "體質偏強" : bad - good >= 3 ? "體質偏弱" : good > bad ? "略偏強" : bad > good ? "略偏弱" : "中性";
  return { code, date, close, lights, good, bad, verdict };
}

const SYSTEM = `你是台灣股市的看盤助理。使用者給你一檔股票的體檢燈號（全部是程式算好的事實），請寫一句總結。
規則：
- 只能根據提供的燈號內容，不要捏造數字、消息面或產業看法。
- 先講整體狀態，再點出最值得注意的一兩件事（優點或風險），不要逐條複述。
- 綠燈是偏好、紅燈是偏弱、黃燈是中性或要留意；黃燈、參考的項目不要硬說成缺點。融資使用率低、融資減少都不是缺點。
- 不要給買賣建議（不要說「建議買進」「可以布局」），用描述的口吻。
- 繁體中文、台灣用語，50 字內，只輸出那一句話。`;

const LV_NAME: Record<Lv, string> = { g: "綠燈", y: "黃燈", r: "紅燈", n: "參考" };

export async function checkupAi(x: Checkup, name: string): Promise<string> {
  const facts = [`${x.code} ${name}，${x.date} 收盤 ${x.close}，程式判斷：${x.verdict}（綠 ${x.good}、紅 ${x.bad}）`, ...x.lights.map((l) => `${l.name}（${LV_NAME[l.lv]}）：${l.text}`)].join("\n");
  const text = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: facts }], { timeout: 240_000 });
  const s = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim().replace(/^["「]|["」]$/g, "").split("\n").filter(Boolean).at(-1) ?? "";
  if (!s) throw new Error("AI 沒有回應內容");
  return s.slice(0, 120);
}

const BATCH_SYSTEM = SYSTEM.replace("請寫一句總結。", "請替每一檔各寫一句總結。").replace("只輸出那一句話。", '只輸出 JSON：{"items":[{"c":"代號","text":"總結"}]}');

/** 批次版：一次問好幾檔（scripts/checkup-all.ts 每天預先算），回傳 代號 → 一句總結 */
export async function checkupAiBatch(list: { x: Checkup; name: string }[]): Promise<Map<string, string>> {
  const facts = list.map(({ x, name }) => [`## ${x.code} ${name}，${x.date} 收盤 ${x.close}，程式判斷：${x.verdict}（綠 ${x.good}、紅 ${x.bad}）`, ...x.lights.map((l) => `${l.name}（${LV_NAME[l.lv]}）：${l.text}`)].join("\n")).join("\n\n");
  const j = parseJson<{ items: { c: string; text: string }[] }>(await chat([{ role: "system", content: BATCH_SYSTEM }, { role: "user", content: facts }], { timeout: 240_000 }));
  const ok = new Set(list.map((l) => l.x.code));
  return new Map((j.items ?? []).filter((r) => ok.has(String(r.c)) && r.text).map((r) => [String(r.c), String(r.text).trim().slice(0, 120)]));
}
