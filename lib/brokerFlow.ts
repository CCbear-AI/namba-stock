// 分點第二期：換手（安定／浮動籌碼）、0050 成分股換手、隔日沖、排序（賣方集中度扣價量因素後的百分位）
import { getDaily, type Series } from "./history";
import { getBrokerDays, shortName } from "./brokers";
import { CLS_NAME, getClass, sideOf, type Cls } from "./brokerCls";
import universe from "@/data/universe.json";

const NAME = new Map((universe as { c: string; n: string }[]).map((u) => [u.c, u.n]));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pctOf = (a: number, b: number) => (a > 0 && b > 0 ? (a / b - 1) * 100 : NaN);

function ctx() {
  const { days, names } = getBrokerDays();
  const { dates, s } = getDaily();
  const { m: cls } = getClass();
  const di = days.map((d) => dates.indexOf(d.date));
  const nm = (id: string) => shortName(names.get(id) ?? id);
  const cl = (id: string): Cls => cls.get(id)?.cls ?? "none";
  return { days, names, dates, s, cls, di, nm, cl };
}
type Ctx = ReturnType<typeof ctx>;

/** 某檔在 [e-n+1, e] 這幾天：安定／浮動籌碼各自的買（淨買加總）與賣（淨賣加總），張 */
function handoffOf(x: Ctx, code: string, e: number, n = 5) {
  const per = new Map<string, number>();
  for (let k = Math.max(0, e - n + 1); k <= e; k++) for (const [id, b, sl] of x.days[k].s.get(code)?.rows ?? []) per.set(id, (per.get(id) ?? 0) + b - sl);
  const t = { sb: 0, ss: 0, fb: 0, fs: 0 };
  let lead: { id: string; v: number; side: "s" | "f" } | null = null;
  let leadF: { id: string; v: number } | null = null;
  for (const [id, v] of per) {
    const side = sideOf(x.cl(id));
    if (!side || !v) continue;
    if (side === "s") { if (v > 0) t.sb += v; else t.ss -= v; } else { if (v > 0) t.fb += v; else t.fs -= v; }
    if (v > 0 && side === "s" && (!lead || v > lead.v)) lead = { id, v, side };
    if (v > 0 && side === "f" && (!leadF || v > leadF.v)) leadF = { id, v };
  }
  const gross = t.sb + t.ss + t.fb + t.fs;
  const sNet = t.sb - t.ss, fNet = t.fb - t.fs;
  // 分數：安定淨買 − 浮動淨買，除以雙方進出總量；+100＝全是放長的在接、短線的在出
  const score = gross ? Math.round(((sNet - fNet) / gross) * 100) : 0;
  return { ...t, sNet, fNet, gross, score, lead: lead?.id ?? null, leadF: leadF?.id ?? null };
}
export const handoffLabel = (score: number) => (score >= 20 ? "變安定" : score <= -20 ? "變浮動" : "普通換手");

/** 個股頁的「換手品質」：這一週（近 5 個交易日） */
export function stockHandoff(code: string) {
  const x = ctx();
  if (!x.days.length) return null;
  const h = handoffOf(x, code, x.days.length - 1);
  return { ...h, label: handoffLabel(h.score), lead: h.lead && x.nm(h.lead), leadF: h.leadF && x.nm(h.leadF) };
}

/** 全市場換手：日均成交 1 億以上、這週安定＋浮動進出 1 億以上的股票，變安定、變浮動各前 15 */
export function handoffMarket() {
  const x = ctx();
  const e = x.days.length - 1;
  if (e < 0) return { error: "還沒有分點資料" };
  const ix = x.di[e];
  const rows = [];
  for (const c of x.days[e].s.keys()) {
    const se = x.s.get(c);
    if (!se) continue;
    const val20 = se.val.slice(ix - 19, ix + 1).filter((v) => !Number.isNaN(v));
    if (!val20.length || val20.reduce((a, v) => a + v, 0) / val20.length < 100) continue;
    const h = handoffOf(x, c, e);
    const px = se.c[ix];
    const amt = (h.gross * px) / 1e5;
    if (amt < 1) continue;
    const yi = (v: number) => r2((v * px) / 1e5);
    rows.push({
      c, n: NAME.get(c) ?? c, score: h.score, amt: r2(amt), sb: yi(h.sb), ss: yi(h.ss), fb: yi(h.fb), fs: yi(h.fs),
      lead: h.score >= 0 ? (h.lead && x.nm(h.lead)) : (h.leadF && x.nm(h.leadF)),
      d20: r1(pctOf(px, se.c[ix - 20])),
    });
  }
  return {
    date: x.days[e].date, from: x.days[Math.max(0, e - 4)].date,
    stable: rows.filter((r) => r.score > 0).sort((a, b) => b.score - a.score || b.amt - a.amt).slice(0, 15),
    float: rows.filter((r) => r.score < 0).sort((a, b) => a.score - b.score || b.amt - a.amt).slice(0, 15),
  };
}

type Grp = "long" | "both" | "short" | "out";
const grpOf = (sNet: number, fNet: number): Grp => (sNet > 0 && fNet <= 0 ? "long" : sNet > 0 ? "both" : fNet > 0 ? "short" : "out");
/** 0050 成分股換手：近 5 日安定／浮動淨買，分四組；to＝看哪一天（回放用） */
export function tw50View(codes: string[], to?: string) {
  const x = ctx();
  if (!x.days.length) return { error: "還沒有分點資料" };
  let e = to ? x.days.findIndex((d) => d.date === to) : x.days.length - 1;
  if (e < 0) e = x.days.length - 1;
  const rows = codes.filter((c) => x.days[e].s.has(c)).map((c) => {
    const h = handoffOf(x, c, e);
    const g = grpOf(h.sNet, h.fNet);
    // 連續幾天同一組（每天都往前看 5 日）
    let streak = 1;
    for (let k = e - 1; k >= 4; k--) { const p = handoffOf(x, c, k); if (grpOf(p.sNet, p.fNet) !== g) break; streak++; }
    return { c, n: NAME.get(c) ?? c, score: h.score, sNet: h.sNet, fNet: h.fNet, grp: g, streak, sb: h.sb, ss: h.ss, fb: h.fb, fs: h.fs };
  });
  const sNet = rows.reduce((a, r) => a + r.sNet, 0), fNet = rows.reduce((a, r) => a + r.fNet, 0);
  const gross = rows.reduce((a, r) => a + r.sb + r.ss + r.fb + r.fs, 0);
  const score = gross ? Math.round(((sNet - fNet) / gross) * 100) : 0;
  return {
    date: x.days[e].date, from: x.days[Math.max(0, e - 4)].date, dates: x.days.slice(4).map((d) => d.date),
    total: { sNet, fNet, score, label: handoffLabel(score) }, missing: codes.filter((c) => !x.days[e].s.has(c)),
    rows: rows.sort((a, b) => b.score - a.score),
  };
}

/** 隔日沖：明天要倒的、倒了沒、隔天表現統計、名單 */
export function dtView() {
  const x = ctx();
  const L = x.days.length;
  if (!L) return { error: "還沒有分點資料" };
  const isDt = (id: string) => x.cl(id) === "dt";
  const avgVol = (se: Series, ix: number) => { const a = se.v.slice(ix - 19, ix + 1).filter((v) => !Number.isNaN(v)); return a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0; };
  // 某天各股隔日沖分點的買超
  const buysOn = (k: number) => {
    const ix = x.di[k];
    const out: { c: string; lots: number; pct: number; ids: string[]; px: number; chg: number }[] = [];
    for (const [c, d] of x.days[k].s) {
      const se = x.s.get(c);
      if (!se) continue;
      const by = d.rows.filter(([id, b, sl]) => isDt(id) && b - sl > 0).sort((a, b) => b[1] - b[2] - (a[1] - a[2]));
      const lots = by.reduce((a, [, b, sl]) => a + b - sl, 0);
      const av = avgVol(se, ix);
      if (!lots || !av) continue;
      out.push({ c, lots, pct: (lots / av) * 100, ids: by.map(([id]) => id), px: se.c[ix], chg: pctOf(se.c[ix], se.c[ix - 1]) });
    }
    return out;
  };
  const grade = (p: number) => (p >= 20 ? "高" : p >= 10 ? "中" : "低");
  const today = buysOn(L - 1).filter((r) => r.pct >= 5).sort((a, b) => b.pct - a.pct).slice(0, 60).map((r) => ({
    c: r.c, n: NAME.get(r.c) ?? r.c, pct: r1(r.pct), g: grade(r.pct), lots: r.lots, amt: r2((r.lots * r.px) / 1e5), chg: r1(r.chg), who: r.ids.slice(0, 2).map(x.nm), more: Math.max(0, r.ids.length - 2),
  }));

  // 倒了沒：昨天名單上的股票，那幾家隔日沖分點今天賣了多少
  const dumped = L >= 2 ? buysOn(L - 2).filter((r) => r.pct >= 5).sort((a, b) => b.pct - a.pct).slice(0, 60).map((r) => {
    const ids = new Set(r.ids);
    const sold = (x.days[L - 1].s.get(r.c)?.rows ?? []).filter(([id]) => ids.has(id)).reduce((a, [, b, sl]) => a + Math.max(0, sl - b), 0);
    const se = x.s.get(r.c)!, ix = x.di[L - 1];
    return { c: r.c, n: NAME.get(r.c) ?? r.c, bought: r.lots, sold, ratio: r1(Math.min(100, (sold / r.lots) * 100)), chg: r1(pctOf(se.c[ix], se.c[ix - 1])), who: r.ids.slice(0, 2).map(x.nm) };
  }) : [];

  // 隔天表現：過去 26 天，隔日沖買超佔均量 5–10%／10–20%／20% 以上的隔天，跟全部股票比
  const bins = [[5, 10, "5–10%"], [10, 20, "10–20%"], [20, Infinity, "20% 以上"]] as const;
  const acc = [...bins.map(() => ({ n: 0, o: 0, c: 0, fade: 0 })), { n: 0, o: 0, c: 0, fade: 0 }];
  const add = (a: (typeof acc)[number], se: Series, ix: number) => {
    const pc = se.c[ix], o = se.o[ix + 1], c = se.c[ix + 1];
    if (!(pc > 0 && o > 0 && c > 0)) return;
    a.n++; a.o += (o / pc - 1) * 100; a.c += (c / pc - 1) * 100; if (c < o) a.fade++;
  };
  const from = Math.max(0, L - 27);
  for (let k = from; k < L - 1; k++) {
    const ix = x.di[k];
    for (const r of buysOn(k)) { const b = bins.findIndex(([lo, hi]) => r.pct >= lo && r.pct < hi); if (b >= 0) add(acc[b], x.s.get(r.c)!, ix); }
    for (const c of x.days[k].s.keys()) { const se = x.s.get(c); if (se) add(acc[3], se, ix); }
  }
  const stats = acc.map((a, i) => ({ label: i < 3 ? bins[i][2] : "全部股票", n: a.n, open: a.n ? r2(a.o / a.n) : 0, close: a.n ? r2(a.c / a.n) : 0, fade: a.n ? Math.round((a.fade / a.n) * 100) : 0 }));

  // 名單：隔日沖分點（外資不算），今天買了幾檔、多少錢
  const ixT = x.di[L - 1];
  const todayBuy = new Map<string, { k: number; amt: number }>();
  for (const [c, d] of x.days[L - 1].s) for (const [id, b, sl] of d.rows) if (b - sl > 0) { const t = todayBuy.get(id) ?? { k: 0, amt: 0 }; t.k++; t.amt += ((b - sl) * (x.s.get(c)?.c[ixT] ?? 0)) / 1e5; todayBuy.set(id, t); }
  const list = [...x.cls].filter(([, v]) => v.cls === "dt").map(([id, v]) => ({ id, n: x.nm(id), sell1: r1(v.sell1 * 100), recent: r1(v.recent * 100), cnt: v.n, k: todayBuy.get(id)?.k ?? 0, amt: r2(todayBuy.get(id)?.amt ?? 0) }))
    .sort((a, b) => b.sell1 - a.sell1);
  return { date: x.days[L - 1].date, prev: L >= 2 ? x.days[L - 2].date : null, statFrom: x.days[from].date, today, dumped, stats, list };
}

// ---------------- 排序：賣方集中度扣掉價量因素 ----------------
/** 前五大賣家（淨賣最多的 5 家）合計佔當天成交量 % */
function sellConc(x: Ctx, code: string, k: number) {
  const d = x.days[k].s.get(code);
  if (!d?.vol) return null;
  const nets = d.rows.map(([, b, sl]) => b - sl).filter((v) => v < 0).sort((a, b) => a - b).slice(0, 5);
  return (-nets.reduce((a, v) => a + v, 0) / d.vol) * 100;
}
/** 11 個價量因素：規模（成交值、股價）、漲跌（今天、絕對值、5/20/60 日）、波動（20 日日報酬標準差、平均日波幅）、位置（60 日區間）、量能（量比） */
function factors(se: Series, ix: number) {
  const ret = (a: number) => pctOf(se.c[ix], se.c[ix - a]);
  const rs: number[] = [];
  for (let i = ix - 19; i <= ix; i++) { const r = pctOf(se.c[i], se.c[i - 1]); if (Number.isFinite(r)) rs.push(r); }
  const mean = rs.reduce((a, v) => a + v, 0) / (rs.length || 1);
  const sd = Math.sqrt(rs.reduce((a, v) => a + (v - mean) ** 2, 0) / (rs.length || 1));
  let rng = 0, nr = 0, hi = -Infinity, lo = Infinity, vs = 0, nv = 0;
  for (let i = ix - 59; i <= ix; i++) { if (se.h[i] > 0) { hi = Math.max(hi, se.h[i]); lo = Math.min(lo, se.l[i]); } }
  for (let i = ix - 19; i <= ix; i++) { if (se.c[i] > 0) { rng += (se.h[i] - se.l[i]) / se.c[i]; nr++; } if (se.v[i - 1] > 0) { vs += se.v[i - 1]; nv++; } }
  const f = [Math.log(Math.max(se.val[ix], 0.01)), Math.log(se.c[ix]), ret(1), Math.abs(ret(1)), ret(5), ret(20), ret(60), sd, nr ? (rng / nr) * 100 : NaN, hi > lo ? (se.c[ix] - lo) / (hi - lo) : NaN, nv ? se.v[ix] / (vs / nv) : NaN];
  return f.every(Number.isFinite) ? { f, sd, d5: ret(5), d20: ret(20) } : null;
}
/** 解 (XᵀX + λI)β = Xᵀy */
function ols(X: number[][], y: number[]) {
  const p = X[0].length, A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
  X.forEach((row, i) => { for (let a = 0; a < p; a++) { for (let b = 0; b < p; b++) A[a][b] += row[a] * row[b]; A[a][p] += row[a] * y[i]; } });
  for (let a = 1; a < p; a++) A[a][a] += 1e-6 * X.length;
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < p; r++) if (r !== c && A[c][c]) { const t = A[r][c] / A[c][c]; for (let k = c; k <= p; k++) A[r][k] -= t * A[c][k]; }
  }
  return A.map((row, i) => (row[i] ? row[p] / row[i] : 0));
}
const rankCache = new Map<string, Map<string, { conc: number; pctile: number; sd: number; d5: number; d20: number }>>();
/** 當天全市場：每檔賣方集中度扣掉 11 個價量因素後的殘差，在全市場的百分位 */
export function adjustedConc(date?: string) {
  const x = ctx();
  const k = date ? x.days.findIndex((d) => d.date === date) : x.days.length - 1;
  if (k < 0) return new Map();
  const key = x.days[k].date;
  const hit = rankCache.get(key);
  if (hit) return hit;
  const ix = x.di[k];
  const obs: { c: string; y: number; f: number[]; sd: number; d5: number; d20: number }[] = [];
  for (const c of x.days[k].s.keys()) {
    const se = x.s.get(c), y = sellConc(x, c, k), fz = se && factors(se, ix);
    if (y != null && fz) obs.push({ c, y, ...fz });
  }
  const out = new Map<string, { conc: number; pctile: number; sd: number; d5: number; d20: number }>();
  if (obs.length > 50) {
    // 因素先標準化再回歸
    const p = obs[0].f.length;
    const mu = Array.from({ length: p }, (_, j) => obs.reduce((a, o) => a + o.f[j], 0) / obs.length);
    const sg = Array.from({ length: p }, (_, j) => Math.sqrt(obs.reduce((a, o) => a + (o.f[j] - mu[j]) ** 2, 0) / obs.length) || 1);
    const X = obs.map((o) => [1, ...o.f.map((v, j) => (v - mu[j]) / sg[j])]);
    const beta = ols(X, obs.map((o) => o.y));
    const res = obs.map((o, i) => o.y - X[i].reduce((a, v, j) => a + v * beta[j], 0));
    const sorted = [...res].sort((a, b) => a - b);
    obs.forEach((o, i) => {
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < res[i]) lo = m + 1; else hi = m; }
      out.set(o.c, { conc: r1(o.y), pctile: Math.round((lo / sorted.length) * 100), sd: o.sd, d5: o.d5, d20: o.d20 });
    });
  }
  rankCache.set(key, out);
  return out;
}

/** 排序：清單裡依賣方集中度百分位排；短線漲多的不排序；高波動只提醒 */
export function rankView(codes: string[]) {
  const x = ctx();
  const k = x.days.length - 1;
  if (k < 0) return { error: "還沒有分點資料" };
  const adj = adjustedConc();
  const sds = [...adj.values()].map((v) => v.sd).sort((a, b) => a - b);
  const sd75 = sds[Math.floor(sds.length * 0.75)] ?? Infinity;
  type Row = { c: string; n: string; pctile: number; conc: number; sellers: { n: string; cls: string; pct: number }[]; tags: string[] };
  const rows: Row[] = [], skip: Row[] = [], none: string[] = [];
  for (const c of codes) {
    const a = adj.get(c);
    const d = x.days[k].s.get(c);
    if (!a || !d) { none.push(c); continue; }
    const sellers = d.rows.map(([id, b, sl]) => ({ id, net: b - sl })).filter((r) => r.net < 0).sort((p, q) => p.net - q.net).slice(0, 5)
      .map((r) => ({ n: x.nm(r.id), cls: CLS_NAME[x.cl(r.id)], pct: r1((-r.net / d.vol) * 100) }));
    const tags = [...(a.d5 >= 10 || a.d20 >= 25 ? ["短線漲多"] : []), ...(a.sd >= sd75 ? ["高波動"] : [])];
    const row = { c, n: NAME.get(c) ?? c, pctile: a.pctile, conc: a.conc, sellers, tags };
    (tags.includes("短線漲多") ? skip : rows).push(row);
  }
  return { date: x.days[k].date, rows: rows.sort((p, q) => q.pctile - p.pctile), skip, none };
}
