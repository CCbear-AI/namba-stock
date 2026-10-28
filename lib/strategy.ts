// AI 策略工作室：策略規格（AI 從一句話轉出來的 JSON）＋盤後日 K 回測
// 規則：第 t 天收盤符合進場條件 → 第 t+1 天開盤買；停損／停利／移動停利盤中觸價就賣（跳空就用開盤價）；
// 跌破均線這類收盤才知道的出場 → 隔天開盤賣；持有天數到了 → 當天收盤賣。手續費 0.1425%×2＋證交稅 0.3%。
import { getChips, getDaily, type Series } from "@/lib/history";
import { BY_CODE, UNIVERSE } from "@/lib/universe";
import { THEMES } from "@/lib/themes";
import { ETFS } from "@/lib/etfs";
import { maName, type Cond, type Exit, type Spec, type Universe } from "@/lib/strategySpec";
export * from "@/lib/strategySpec";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const NAME_TO_CODE = new Map(UNIVERSE.map((s) => [s.n, s.c]));
const toCode = (x: string) => { const s = String(x).trim(); return BY_CODE.has(s) || ETFS[s] ? s : NAME_TO_CODE.get(s) ?? null; };

/** AI 給的 JSON 不一定乾淨：檢查欄位、數字範圍、代號，丟掉看不懂的條件 */
export function normalize(raw: Partial<Spec>): Spec {
  const u = (raw.universe ?? { k: "all" }) as Universe;
  const uk = (["all", "tse", "otc", "tw50", "watchlist", "codes", "industry", "theme"] as const).includes(u.k) ? u.k : "all";
  const universe: Universe = { k: uk };
  if (uk === "codes") universe.codes = [...new Set((u.codes ?? []).map(toCode).filter((c): c is string => !!c))].slice(0, 100);
  if (uk === "industry" || uk === "theme") universe.name = String(u.name ?? "");
  // 全市場類的範圍預設濾掉成交值太小的冷門股（買不到、賣不掉）
  universe.minValue = uk === "codes" || uk === "watchlist" ? 0 : clamp(u.minValue ?? 0.3, 0, 100, 0.3);
  if (uk === "theme" && !THEMES[universe.name!]) universe.k = "all";

  const entry: Cond[] = [];
  for (const c of raw.entry ?? []) {
    const x = c as Record<string, unknown>;
    const n = (lo: number, hi: number, d: number) => clamp(x.n, lo, hi, d);
    const opt = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
    switch (x.k) {
      case "aboveMA": case "belowMA": case "crossMA": entry.push({ k: x.k, n: n(2, 240, 20) }); break;
      case "maBull": entry.push({ k: "maBull" }); break;
      case "newHigh": case "newLow": entry.push({ k: x.k, n: n(5, 240, 20) }); break;
      case "chg": entry.push({ k: "chg", n: n(1, 60, 1), min: opt(x.min), max: opt(x.max) }); break;
      case "volRatio": entry.push({ k: "volRatio", n: n(3, 60, 20), min: clamp(x.min, 0.1, 20, 2) }); break;
      case "price": entry.push({ k: "price", min: opt(x.min), max: opt(x.max) }); break;
      case "value": entry.push({ k: "value", min: clamp(x.min, 0, 1000, 1) }); break;
      case "rsi": entry.push({ k: "rsi", n: n(2, 60, 14), min: opt(x.min), max: opt(x.max) }); break;
      case "foreignBuy": case "trustBuy": case "foreignSell": case "trustSell": entry.push({ k: x.k, days: clamp(x.days, 1, 20, 3) }); break;
    }
  }
  const exit: Exit[] = [];
  for (const e of raw.exit ?? []) {
    const x = e as Record<string, unknown>;
    if (x.k === "stopLoss" || x.k === "takeProfit" || x.k === "trailing") exit.push({ k: x.k, pct: clamp(x.pct, 0.5, 90, 10) });
    else if (x.k === "belowMA") exit.push({ k: "belowMA", n: clamp(x.n, 2, 240, 20) });
    else if (x.k === "maxDays") exit.push({ k: "maxDays", n: clamp(x.n, 1, 120, 20) });
  }
  // 沒有任何出場規則會永遠抱著 → 補一個最多抱 20 天
  if (!exit.length) exit.push({ k: "maxDays", n: 20 });
  return {
    name: String(raw.name || "我的策略").slice(0, 30), idea: String(raw.idea ?? "").slice(0, 300),
    universe, entry, exit,
    // 指定個股時，持股上限不超過檔數（不然資金永遠用不完）
    hold: { max: Math.min(clamp(raw.hold?.max, 1, 50, 10), universe.k === "codes" && universe.codes!.length ? universe.codes!.length : 50) },
    rank: raw.rank === "chg" || raw.rank === "volRatio" ? raw.rank : "value",
    assume: (raw.assume ?? []).map(String).slice(0, 8), unsupported: (raw.unsupported ?? []).map(String).slice(0, 8),
  };
}

// ---------- 指標（以每檔自己的交易日計算） ----------
type Ctx = { idx: number[]; c: number[]; o: number[]; h: number[]; l: number[]; v: number[]; val: number[]; pos: Int32Array; cache: Map<string, number[]> };
function ctxOf(s: Series, n: number): Ctx {
  const idx: number[] = [], pos = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (!Number.isNaN(s.c[i]) && s.v[i] > 0) { pos[i] = idx.length; idx.push(i); }
  const pick = (a: number[]) => idx.map((i) => a[i]);
  // 日 K 檔的成交金額單位是百萬，這裡換成億
  return { idx, c: pick(s.c), o: pick(s.o), h: pick(s.h), l: pick(s.l), v: pick(s.v), val: pick(s.val).map((x) => x / 100), pos, cache: new Map() };
}
function memo(x: Ctx, key: string, f: () => number[]) { let a = x.cache.get(key); if (!a) { a = f(); x.cache.set(key, a); } return a; }
const sma = (a: number[], n: number) => { const out = new Array(a.length).fill(NaN); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) out[i] = s / n; } return out; };
const ma = (x: Ctx, n: number) => memo(x, `ma${n}`, () => sma(x.c, n));
function rsi(x: Ctx, n: number) {
  return memo(x, `rsi${n}`, () => {
    const out = new Array(x.c.length).fill(NaN); let up = 0, dn = 0;
    for (let i = 1; i < x.c.length; i++) {
      const d = x.c[i] - x.c[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0);
      if (i <= n) { up += u / n; dn += w / n; } else { up = (up * (n - 1) + u) / n; dn = (dn * (n - 1) + w) / n; }
      if (i >= n) out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
    }
    return out;
  });
}

/** 指標需要往前看幾天 */
function warmup(spec: Spec) {
  let w = 2;
  for (const c of spec.entry) {
    if ("n" in c) w = Math.max(w, c.n + 1);
    if (c.k === "maBull") w = Math.max(w, 61);
  }
  for (const e of spec.exit) if (e.k === "belowMA") w = Math.max(w, e.n);
  return w;
}

type Chip = { dates: Map<string, number>; f: Map<string, number[]>; t: Map<string, number[]> };
function chipStreaks(): Chip {
  const days = getChips();
  const dates = new Map(days.map((d, i) => [d.date, i]));
  const f = new Map<string, number[]>(), t = new Map<string, number[]>();
  // 連買／連賣天數：正數＝連買 N 天、負數＝連賣 N 天
  const add = (m: Map<string, number[]>, code: string, i: number, v: number) => {
    let a = m.get(code); if (!a) { a = new Array(days.length).fill(0); m.set(code, a); }
    const p = i ? a[i - 1] : 0;
    a[i] = v > 0 ? (p > 0 ? p + 1 : 1) : v < 0 ? (p < 0 ? p - 1 : -1) : 0;
  };
  days.forEach((d, i) => { for (const [code, x] of Object.entries(d.s)) { add(f, code, i, x[0] ?? 0); add(t, code, i, x[1] ?? 0); } });
  return { dates, f, t };
}

function test(c: Cond, x: Ctx, j: number, code: string, date: string, chip: Chip | null): boolean {
  const C = x.c[j];
  switch (c.k) {
    case "aboveMA": return C > ma(x, c.n)[j];
    case "belowMA": return C < ma(x, c.n)[j];
    case "crossMA": { const m = ma(x, c.n); return j > 0 && C > m[j] && x.c[j - 1] <= m[j - 1]; }
    case "maBull": return ma(x, 5)[j] > ma(x, 20)[j] && ma(x, 20)[j] > ma(x, 60)[j];
    case "newHigh": { if (j < c.n - 1) return false; let m = -Infinity; for (let k = j - c.n + 1; k < j; k++) m = Math.max(m, x.c[k]); return C >= m; }
    case "newLow": { if (j < c.n - 1) return false; let m = Infinity; for (let k = j - c.n + 1; k < j; k++) m = Math.min(m, x.c[k]); return C <= m; }
    case "chg": { if (j < c.n) return false; const p = (C / x.c[j - c.n] - 1) * 100; return (c.min == null || p >= c.min) && (c.max == null || p <= c.max); }
    case "volRatio": { if (j < c.n) return false; let s = 0; for (let k = j - c.n; k < j; k++) s += x.v[k]; return x.v[j] >= (s / c.n) * c.min; }
    case "price": return (c.min == null || C >= c.min) && (c.max == null || C <= c.max);
    case "value": return x.val[j] >= c.min;
    case "rsi": { const r = rsi(x, c.n)[j]; return Number.isFinite(r) && (c.min == null || r >= c.min) && (c.max == null || r <= c.max); }
    default: {
      const di = chip?.dates.get(date);
      if (di == null) return false;
      const a = (c.k.startsWith("foreign") ? chip!.f : chip!.t).get(code);
      const s = a?.[di] ?? 0;
      return c.k.endsWith("Buy") ? s >= c.days : s <= -c.days;
    }
  }
}

export type Trade = { code: string; name: string; inDate: string; inPrice: number; outDate: string | null; outPrice: number; ret: number; days: number; why: string };
export type Result = {
  from: string; to: string; days: number; universeSize: number;
  ret: number; bench: number | null; maxDD: number; trades: number; winRate: number | null; avgRet: number | null; avgDays: number | null;
  curve: [string, number, number | null][]; list: Trade[]; holding: Trade[];
  today: { code: string; name: string; close: number; chg: number; value: number }[];
  note: string[];
};

const FEE = 0.001425, TAX = 0.003;

export function backtest(spec: Spec, opts: { watchlist?: string[]; bench?: Map<string, number>; window?: number } = {}): Result {
  const D = getDaily();
  const N = D.dates.length;
  const note: string[] = [];
  const usesChips = spec.entry.some((c) => c.k.startsWith("foreign") || c.k.startsWith("trust"));
  const chip = usesChips ? chipStreaks() : null;

  // 範圍
  let codes: string[];
  const u = spec.universe;
  if (u.k === "codes") codes = u.codes ?? [];
  else if (u.k === "watchlist") codes = (opts.watchlist ?? []).filter((c) => D.s.has(c));
  else if (u.k === "theme") codes = THEMES[u.name!] ?? [];
  else codes = UNIVERSE.filter((s) => (u.k === "tse" ? s.m === "tse" : u.k === "otc" ? s.m === "otc" : u.k === "industry" ? s.ind === u.name : u.k === "tw50" ? s.m === "tse" : true)).map((s) => s.c);
  codes = codes.filter((c) => D.s.has(c));
  if (u.k === "industry" && !codes.length) note.push(`找不到「${u.name}」這個產業，請換個說法`);
  if (u.k === "watchlist" && !codes.length) note.push("自選股是空的（或還沒有日 K 資料）");

  const ctx = new Map(codes.map((c) => [c, ctxOf(D.s.get(c)!, N)]));

  // 回測期間：預設最近 120 個交易日（約半年）；指標要暖身，籌碼只有最近幾十天
  let start = Math.max(warmup(spec), N - (opts.window ?? 120));
  if (chip) {
    const first = D.dates.findIndex((d) => chip.dates.has(d));
    const need = Math.max(...spec.entry.map((c) => ("days" in c ? c.days : 0)));
    if (first >= 0 && first + need > start) { start = Math.min(N - 2, first + need); note.push(`用到法人買賣超，籌碼資料只到 ${D.dates[first]} 起，回測期間縮短`); }
  }
  if (start >= N - 1) start = Math.max(1, N - 2);
  if (warmup(spec) > N - 120) note.push(`用到較長的均線，日 K 歷史只有 ${N} 天，回測期間縮短`);

  // 0050 權值股：每天用「股本 × 收盤」排出上市市值前 50 大
  const tw50 = (t: number) => {
    const cap = codes.map((c) => [c, (BY_CODE.get(c)?.sh ?? 0) * (D.s.get(c)!.c[t] || 0)] as const).sort((a, b) => b[1] - a[1]);
    return new Set(cap.slice(0, 50).map(([c]) => c));
  };

  const signals = (t: number) => {
    const set = u.k === "tw50" ? tw50(t) : null;
    const out: { code: string; score: number; close: number; chg: number; value: number }[] = [];
    for (const code of codes) {
      if (set && !set.has(code)) continue;
      const x = ctx.get(code)!, j = x.pos[t];
      if (j < 1) continue;
      if (u.minValue && x.val[j] < u.minValue) continue;
      if (!spec.entry.every((c) => test(c, x, j, code, D.dates[t], chip))) continue;
      const chg = (x.c[j] / x.c[j - 1] - 1) * 100;
      let vr = 0; if (j >= 20) { let s = 0; for (let k = j - 20; k < j; k++) s += x.v[k]; vr = x.v[j] / (s / 20); }
      out.push({ code, close: x.c[j], chg: r2(chg), value: r2(x.val[j]), score: spec.rank === "chg" ? chg : spec.rank === "volRatio" ? vr : x.val[j] });
    }
    return out.sort((a, b) => b.score - a.score);
  };

  type Pos = { code: string; t0: number; price: number; shares: number; peak: number; sellNextOpen?: string };
  const held: Pos[] = [];
  let pending: string[] = [];
  let cash = 1_000_000;
  const trades: Trade[] = [];
  const curve: [string, number, number | null][] = [];
  const name = (c: string) => BY_CODE.get(c)?.n ?? ETFS[c] ?? c;
  const sl = spec.exit.find((e) => e.k === "stopLoss") as { pct: number } | undefined;
  const tp = spec.exit.find((e) => e.k === "takeProfit") as { pct: number } | undefined;
  const tr = spec.exit.find((e) => e.k === "trailing") as { pct: number } | undefined;
  const md = spec.exit.find((e) => e.k === "maxDays") as { n: number } | undefined;
  const bm = spec.exit.filter((e) => e.k === "belowMA") as { n: number }[];

  const close = (p: Pos, t: number, price: number, why: string) => {
    cash += p.shares * price * (1 - FEE - TAX);
    const x = ctx.get(p.code)!;
    trades.push({ code: p.code, name: name(p.code), inDate: D.dates[p.t0], inPrice: r2(p.price), outDate: D.dates[t], outPrice: r2(price), ret: r2(((price * (1 - FEE - TAX)) / (p.price * (1 + FEE)) - 1) * 100), days: x.pos[t] - x.pos[p.t0] + 1, why });
    held.splice(held.indexOf(p), 1);
  };
  const equity = (t: number) => cash + held.reduce((a, p) => { const x = ctx.get(p.code)!; let k = t; while (k > 0 && x.pos[k] < 0) k--; return a + p.shares * (D.s.get(p.code)!.c[k] || p.price); }, 0);

  for (let t = start; t < N; t++) {
    // ① 開盤：前一天訊號買進、前一天收盤觸發的出場賣出
    for (const p of [...held]) if (p.sellNextOpen && ctx.get(p.code)!.pos[t] >= 0) close(p, t, D.s.get(p.code)!.o[t], p.sellNextOpen);
    if (pending.length) {
      const eq = equity(t - 1);
      for (const code of pending) {
        const s = D.s.get(code)!, o = s.o[t];
        if (!(o > 0) || held.length >= spec.hold.max) continue;
        const amt = Math.min(cash, eq / spec.hold.max);
        if (amt < 1000) continue;
        const shares = amt / (o * (1 + FEE));
        cash -= amt;
        held.push({ code, t0: t, price: o, shares, peak: o });
      }
      pending = [];
    }
    // ② 盤中：停損、停利、移動停利（同一天都碰到時保守當作先停損）
    for (const p of [...held]) {
      const s = D.s.get(p.code)!, x = ctx.get(p.code)!;
      if (x.pos[t] < 0) continue;
      const o = s.o[t], h = s.h[t], l = s.l[t];
      const stops: [number, string][] = [];
      if (sl) stops.push([p.price * (1 - sl.pct / 100), `停損 ${sl.pct}%`]);
      if (tr) stops.push([p.peak * (1 - tr.pct / 100), `移動停利 ${tr.pct}%`]);
      const stop = stops.sort((a, b) => b[0] - a[0])[0];
      if (stop && l <= stop[0]) { close(p, t, Math.min(o, stop[0]), stop[1]); continue; }
      if (tp && h >= p.price * (1 + tp.pct / 100)) { close(p, t, Math.max(o, p.price * (1 + tp.pct / 100)), `停利 ${tp.pct}%`); continue; }
      p.peak = Math.max(p.peak, h);
      // ③ 收盤：持有天數、跌破均線
      const days = x.pos[t] - x.pos[p.t0] + 1;
      if (md && days >= md.n) { close(p, t, s.c[t], `抱滿 ${md.n} 天`); continue; }
      const j = x.pos[t];
      const hit = bm.find((e) => s.c[t] < ma(x, e.n)[j]);
      if (hit && t > p.t0) p.sellNextOpen = `跌破${maName(hit.n)}`;
    }
    // ④ 收盤後選股，隔天開盤買
    if (t < N - 1) {
      const have = new Set(held.map((p) => p.code));
      const free = spec.hold.max - held.filter((p) => !p.sellNextOpen).length;
      if (free > 0) pending = signals(t).filter((s) => !have.has(s.code)).slice(0, free).map((s) => s.code);
    }
    curve.push([D.dates[t], equity(t), null]);
  }

  // 0050 對照（同一段期間買進持有）
  const b = opts.bench;
  let bench: number | null = null;
  if (b && b.size) {
    let base: number | null = null;
    for (const row of curve) { const v = b.get(row[0]); if (v != null) { if (base == null) base = v; row[2] = r2((v / base) * 100); } }
    const lastB = [...curve].reverse().find((r) => r[2] != null);
    bench = lastB ? r2(lastB[2]! - 100) : null;
  } else note.push("0050 對照資料暫時抓不到");
  for (const row of curve) row[1] = r2((row[1] / 1_000_000) * 100);

  let peak = 0, maxDD = 0;
  for (const [, v] of curve) { peak = Math.max(peak, v); maxDD = Math.min(maxDD, (v / peak - 1) * 100); }
  const T = N - 1;
  const holding: Trade[] = held.map((p) => {
    const x = ctx.get(p.code)!; let k = T; while (k > 0 && x.pos[k] < 0) k--;
    const c = D.s.get(p.code)!.c[k];
    return { code: p.code, name: name(p.code), inDate: D.dates[p.t0], inPrice: r2(p.price), outDate: null, outPrice: r2(c), ret: r2((c / p.price - 1) * 100), days: x.pos[k] - x.pos[p.t0] + 1, why: p.sellNextOpen ? `${p.sellNextOpen}，下個交易日開盤賣` : "持有中" };
  });
  const wins = trades.filter((x) => x.ret > 0).length;
  return {
    from: D.dates[start], to: D.dates[T], days: N - start, universeSize: codes.length,
    ret: r2((curve.at(-1)?.[1] ?? 100) - 100), bench, maxDD: r2(maxDD),
    trades: trades.length, winRate: trades.length ? r2((wins / trades.length) * 100) : null,
    avgRet: trades.length ? r2(trades.reduce((a, x) => a + x.ret, 0) / trades.length) : null,
    avgDays: trades.length ? r2(trades.reduce((a, x) => a + x.days, 0) / trades.length) : null,
    curve, list: trades.slice(-200).reverse(), holding,
    today: signals(T).slice(0, 30).map(({ code, close, chg, value }) => ({ code, name: name(code), close, chg, value })),
    note,
  };
}
