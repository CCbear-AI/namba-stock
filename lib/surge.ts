// 飆股訊號：每檔每天依盤後資料（日K、法人、融資、集保、分點）判斷有沒有出現「起漲前兆」，
// 再用過去的資料回測每個訊號：出現後隔天開盤買進，5／20 個交易日後的報酬扣掉全市場同期平均（超額報酬），
// 以及 20 天內最高漲到 +20% 以上的機率（飆股命中率）跟全體股票比。
// 分數＝今天出現的訊號、各自歷史 20 日超額報酬（次數少的打折）加總；只算回測是正的訊號。
// 權重用前半段資料算、後半段驗證分數高的到底有沒有比較會漲，避免「用答案出題」。
import { getChips, getDaily, getTdcc, type Series } from "./history";
import { getBrokerDays } from "./brokers";
import { SIGS, type SigId, type SigStat, type Backtest, type Cand } from "./surgeSigs";

export * from "./surgeSigs";

const MIN_VAL = 30; // 近 20 日平均成交值 ≥ 3,000 萬（daily 的成交值單位是百萬）
const HOLD = 20, HIT = 0.2, DROP = -0.1, GAP = 10, SHRINK = 30;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Ctx = {
  dates: string[]; s: Map<string, Series>;

  chipAt: (code: string, i: number) => number[] | undefined;
  marginOk: boolean[]; // 那天全市場有融資資料（21:00 才公布，16:30 那份是 0）
  tdccAt: Map<number, Map<string, [number, number, number, number]>>; // 交易日 i → 代號 → [大戶%, 前週大戶%, 股東, 前週股東]
  brokerNet: (code: string, i: number) => [number, number] | null; // [前 15 名分點淨買, 成交量]（張）
};

function context(): Ctx {
  const { dates, s } = getDaily();
  const idx = new Map(dates.map((d, i) => [d, i]));
  const chipsByI = new Map<number, Record<string, number[]>>();
  for (const d of getChips()) { const i = idx.get(d.date); if (i != null) chipsByI.set(i, d.s); }
  const marginOk = dates.map((_, i) => { const x = chipsByI.get(i); return !!x && Object.values(x).some((v) => v[3] > 0); });
  const tdccAt = new Map<number, Map<string, [number, number, number, number]>>();
  const td = getTdcc();
  for (let k = 1; k < td.length; k++) {
    const i = dates.findIndex((d) => d >= td[k].date); // 集保日期是週五，訊號放在那天（沒開盤就下一個交易日）
    if (i < 0) continue;
    const m = new Map<string, [number, number, number, number]>();
    for (const [c, [p, h]] of Object.entries(td[k].s)) { const q = td[k - 1].s[c]; if (q) m.set(c, [p, q[0], h, q[1]]); }
    tdccAt.set(i, m);
  }
  const { days } = getBrokerDays();
  const bByI = new Map<number, (typeof days)[number]["s"]>();
  for (const d of days) { const i = idx.get(d.date); if (i != null) bByI.set(i, d.s); }
  return {
    dates, s, marginOk, tdccAt,
    chipAt: (c, i) => chipsByI.get(i)?.[c],
    brokerNet: (c, i) => {
      let net = 0, vol = 0;
      for (let k = i - 4; k <= i; k++) {
        const m = bByI.get(k);
        if (!m) return null;
        const x = m.get(c);
        if (!x) continue;
        vol += x.vol;
        for (const [, b, sl] of x.rows) net += b - sl;
      }
      return vol ? [net, vol] : null;
    },
  };
}

function avgRange(a: number[], from: number, to: number) {
  let s = 0, k = 0;
  for (let i = Math.max(0, from); i <= to; i++) if (a[i] > 0) { s += a[i]; k++; }
  return k ? s / k : NaN;
}
function maxRange(a: number[], from: number, to: number) {
  let m = -Infinity;
  for (let i = Math.max(0, from); i <= to; i++) if (a[i] > m) m = a[i];
  return m;
}
function minRange(a: number[], from: number, to: number) {
  let m = Infinity;
  for (let i = Math.max(0, from); i <= to; i++) if (a[i] > 0 && a[i] < m) m = a[i];
  return m;
}
const sma = (c: number[], n: number, e: number) => (e + 1 >= n ? avgRange(c, e - n + 1, e) : NaN);

/** 這檔股票第 i 天夠不夠格（有交易、成交值夠、前 60 天都有資料） */
function eligible(x: Series, i: number) {
  if (i < 60 || !(x.c[i] > 0) || !(x.v[i] > 0)) return false;
  for (let k = i - 60; k < i; k++) if (!(x.c[k] > 0)) return false;
  return avgRange(x.val, i - 19, i) >= MIN_VAL;
}

/** 第 i 天收盤後出現哪些訊號 */
function signalsAt(ctx: Ctx, code: string, x: Series, i: number): SigId[] {
  const out: SigId[] = [];
  const { c, o, h, l, v } = x;
  const pct = (c[i] / c[i - 1] - 1) * 100;
  const v5 = avgRange(v, i - 5, i - 1), v20 = avgRange(v, i - 20, i - 1), v60 = avgRange(v, i - 60, i - 1);
  const ma20 = sma(c, 20, i);
  if (pct >= 5 && v[i] >= 2 * v5 && c[i] > ma20) out.push("rocket");
  if (c[i] >= maxRange(c, i - 59, i - 1) && v[i] >= 2 * v20 && pct > 0) out.push("brk60");
  { const hi = maxRange(h, i - 20, i - 1), lo = minRange(l, i - 20, i - 1); if (hi / lo - 1 <= 0.12 && c[i] > hi && v[i] >= 1.5 * v20) out.push("squeeze"); }
  if (avgRange(v, i - 10, i - 1) <= 0.6 * v60 && pct >= 3 && v[i] >= 2 * v20) out.push("dry");
  if (o[i] >= h[i - 1] * 1.02 && c[i] >= o[i] && pct >= 3) out.push("gap");
  if (pct >= 9.5 && c[i - 1] / c[i - 2] - 1 < 0.095) out.push("limup");
  { const now = sma(c, 5, i) > ma20 && ma20 > sma(c, 60, i), was = sma(c, 5, i - 5) > sma(c, 20, i - 5) && sma(c, 20, i - 5) > sma(c, 60, i - 5); if (now && !was) out.push("bull"); }
  const ch = ctx.chipAt(code, i);
  if (ch) {
    if (ch[0] > 0 && ch[1] > 0 && ch[0] + ch[1] >= 0.1 * v[i]) out.push("inst2");
    let t3 = 0, t10 = 0, ok = true;
    for (let k = i - 12; k <= i; k++) { const r = ctx.chipAt(code, k); if (!r) { ok = false; break; } if (k > i - 3) t3 += r[1]; else t10 += r[1]; }
    if (ok && t3 >= 0.03 * v20 && t3 > 0 && t10 <= 0) out.push("tBuy");
    if (ctx.marginOk[i] && ctx.marginOk[i - 5]) {
      const p5 = ctx.chipAt(code, i - 5);
      if (p5 && p5[3] > 0 && ch[3] > 0 && c[i] / c[i - 5] - 1 >= 0.05 && ch[3] / p5[3] - 1 <= -0.03) out.push("clean");
    }
  }
  const td = ctx.tdccAt.get(i)?.get(code);
  if (td && td[0] - td[1] >= 0.5 && td[2] < td[3]) out.push("bigUp");
  const bn = ctx.brokerNet(code, i);
  if (bn && bn[0] / bn[1] >= 0.1) out.push("conc");
  return out;
}

let memo: { key: string; bt: Backtest; ctx: Ctx } | null = null;

/** 回測全部訊號（資料一天變一次，記憶體快取到下一份日K） */
export function backtest(): { bt: Backtest; ctx: Ctx } {
  const { dates } = getDaily();
  const key = `${dates.at(-1)}:${getChips().length}:${getTdcc().length}:${getBrokerDays().days.length}`;
  if (memo?.key === key) return memo;
  const ctx = context();
  const N = dates.length;
  const codes = [...ctx.s.keys()].filter((c) => !c.startsWith("00"));
  // 全市場等權平均：第 i 天訊號 → 第 i+1 天開盤買 → 第 i+H 天收盤
  const mkt = (H: number) => dates.map((_, i) => {
    if (i + H >= N) return NaN;
    let sum = 0, n = 0;
    for (const c of codes) { const x = ctx.s.get(c)!; const a = x.o[i + 1], b = x.c[i + H]; if (a > 0 && b > 0 && x.val[i] > 0) { sum += b / a - 1; n++; } }
    return n ? sum / n : NaN;
  });
  const m5 = mkt(5), m20 = mkt(HOLD);
  const mid = Math.floor((60 + N - HOLD) / 2); // 前半段算權重、後半段驗證
  type Acc = { n: number; e5: number; e20: number; w20: number; hit: number; drop: number; n1: number; s1: number; first: number };
  const acc = new Map<SigId, Acc>(SIGS.map((g) => [g.id, { n: 0, e5: 0, e20: 0, w20: 0, hit: 0, drop: 0, n1: 0, s1: 0, first: -1 }]));
  let baseN = 0, baseHit = 0, baseDrop = 0;
  const events: { i: number; sigs: SigId[]; e20: number; hit: boolean; drop: boolean }[] = [];
  for (const c of codes) {
    const x = ctx.s.get(c)!;
    const lastSeen = new Map<SigId, number>();
    for (let i = 60; i < N - 1; i++) {
      if (!eligible(x, i)) continue;
      const done = i + HOLD < N && x.o[i + 1] > 0 && x.c[i + HOLD] > 0;
      const entry = x.o[i + 1];
      // 飆股命中＝20 天內最高價漲到 +20%；大跌＝20 天內最低價跌到 -10%
      const hit = done && maxRange(x.h, i + 1, i + HOLD) / entry - 1 >= HIT;
      const drop = done && minRange(x.l, i + 1, i + HOLD) / entry - 1 <= DROP;
      if (done) { baseN++; if (hit) baseHit++; if (drop) baseDrop++; }
      const sigs = signalsAt(ctx, c, x, i);
      if (!sigs.length || !done) continue;
      const e20 = (x.c[i + HOLD] / entry - 1 - m20[i]) * 100;
      const e5 = x.c[i + 5] > 0 ? (x.c[i + 5] / entry - 1 - m5[i]) * 100 : NaN;
      for (const g of sigs) {
        // 同一檔同一個訊號 10 天內只算第一次（連續幾天都符合不重複計）
        if (i - (lastSeen.get(g) ?? -99) < GAP) { lastSeen.set(g, i); continue; }
        lastSeen.set(g, i);
        const a = acc.get(g)!;
        a.n++; a.e20 += e20; if (e20 > 0) a.w20++; if (hit) a.hit++; if (drop) a.drop++;
        if (Number.isFinite(e5)) a.e5 += e5;
        if (i < mid) { a.n1++; a.s1 += e20; }
        if (a.first < 0 || i < a.first) a.first = i;
      }
      events.push({ i, sigs, e20, hit, drop });
    }
  }
  const stats: SigStat[] = SIGS.map(({ id }) => {
    const a = acc.get(id)!;
    const ex20 = a.n ? a.e20 / a.n : 0;
    // 權重只用前半段（次數少的打折），後半段拿來驗證
    const w1 = a.n1 ? (a.s1 / a.n1) * (a.n1 / (a.n1 + SHRINK)) : 0;
    return { id, n: a.n, ex5: r2(a.n ? a.e5 / a.n : 0), ex20: r2(ex20), win20: a.n ? Math.round((a.w20 / a.n) * 100) : 0, hit: a.n ? r2((a.hit / a.n) * 100) : 0, drop: a.n ? r2((a.drop / a.n) * 100) : 0, w: r2(Math.max(0, w1)), from: a.first >= 0 ? dates[a.first] : "" };
  });
  // 前半段資料不夠的訊號（法人、集保、分點只有最近幾個月）改用全期間打折
  for (const st of stats) {
    const a = acc.get(st.id)!;
    if (a.n1 < 30 && a.n) st.w = r2(Math.max(0, (a.e20 / a.n) * (a.n / (a.n + SHRINK))));
  }
  const W = new Map(stats.map((s) => [s.id, s.w]));
  // 後半段驗證：依分數分組，看 20 天後的超額報酬與飆股命中率
  const groups: [string, (v: number) => boolean][] = [["分數 0（有訊號但都沒加分）", (v) => v === 0], ["0～2 分", (v) => v > 0 && v < 2], ["2～4 分", (v) => v >= 2 && v < 4], ["4 分以上", (v) => v >= 4]];
  const oos = groups.map(([label, f]) => {
    const ev = events.filter((e) => e.i >= mid && f(e.sigs.reduce((t, g) => t + (W.get(g) ?? 0), 0)));
    return { label, n: ev.length, ex20: r2(ev.length ? ev.reduce((t, e) => t + e.e20, 0) / ev.length : 0), hit: r2(ev.length ? (ev.filter((e) => e.hit).length / ev.length) * 100 : 0), drop: r2(ev.length ? (ev.filter((e) => e.drop).length / ev.length) * 100 : 0) };
  });
  memo = { key, ctx, bt: { from: dates[60], to: dates[N - 1 - HOLD], mid: dates[mid], base: { hit: r2(baseN ? (baseHit / baseN) * 100 : 0), drop: r2(baseN ? (baseDrop / baseN) * 100 : 0), n: baseN }, stats, oos } };
  return memo;
}


/** 第 i 天（預設最新一天）全市場的訊號與分數，分數高到低 */
export function candidates(i?: number): Cand[] {
  const { bt, ctx } = backtest();
  const W = new Map(bt.stats.map((s) => [s.id, s.w]));
  const at = i ?? ctx.dates.length - 1;
  const out: Cand[] = [];
  for (const [c, x] of ctx.s) {
    if (c.startsWith("00") || !eligible(x, at)) continue;
    const sigs = signalsAt(ctx, c, x, at);
    if (!sigs.length) continue;
    const score = r2(sigs.reduce((t, g) => t + (W.get(g) ?? 0), 0));
    const d5 = (x.c[at] / x.c[at - 5] - 1) * 100, d20 = (x.c[at] / x.c[at - 20] - 1) * 100;
    const bias = (x.c[at] / sma(x.c, 20, at) - 1) * 100;
    const risk: string[] = [];
    if (d5 >= 20 || d20 >= 40) risk.push("短線漲多");
    if (bias >= 20) risk.push("離月線太遠");
    const ch = ctx.chipAt(c, at), p5 = ctx.chipAt(c, at - 5);
    if (ctx.marginOk[at] && ctx.marginOk[at - 5] && ch && p5 && p5[3] > 0 && ch[3] / p5[3] - 1 >= 0.15) risk.push("融資大增");
    out.push({ c, score, sigs, close: x.c[at], pct: r2((x.c[at] / x.c[at - 1] - 1) * 100), d5: r2(d5), d20: r2(d20), vr: r2(x.v[at] / avgRange(x.v, at - 5, at - 1)), val: r2(x.val[at] / 100), risk });
  }
  return out.sort((a, b) => b.score - a.score || b.val - a.val);
}
