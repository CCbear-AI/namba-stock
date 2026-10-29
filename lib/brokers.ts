// 分點進出（伺服器端）：讀 data/brokers 每天各股買賣超前 15 名分點，算個股、全市場、河道、追蹤要的東西
// 只看得到每檔每天進榜的前 15 買、前 15 賣，沒進榜的日子當 0；金額＝張數 × 當天收盤
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getDaily } from "./history";
import universe from "@/data/universe.json";

const DIR = path.join(process.cwd(), "data", "brokers");
const TTL = 10 * 60_000;
const NAME = new Map((universe as { c: string; n: string }[]).map((u) => [u.c, u.n]));

type Day = { date: string; s: Map<string, { vol: number; rows: [string, number, number][] }> };
type Store = { days: Day[]; names: Map<string, string> };

let hit: { at: number; v: Store } | null = null;
export function getBrokerDays(): Store {
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort() : [];
  const names = new Map<string, string>();
  const days = files.map((f): Day => {
    const j = JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as { date: string; n: Record<string, string>; s: Record<string, (string | number)[]> };
    for (const [id, n] of Object.entries(j.n)) names.set(id, n);
    const s: Day["s"] = new Map();
    for (const [c, a] of Object.entries(j.s)) {
      if (c.startsWith("00")) continue; // ETF 不算（只看個股）
      const rows: [string, number, number][] = [];
      for (let i = 1; i + 2 < a.length; i += 3) rows.push([a[i] as string, a[i + 1] as number, a[i + 2] as number]);
      s.set(c, { vol: a[0] as number, rows });
    }
    return { date: j.date, s };
  });
  hit = { at: Date.now(), v: { days, names } };
  return hit.v;
}

// 富邦頁的券商全名太長，常見外資改短名
const SHORT: Record<string, string> = { 台灣摩根士丹利: "摩根士丹利", 香港上海匯豐: "匯豐" };
export const shortName = (n: string) => SHORT[n] ?? n.replace(/^(新加坡商|港商)/, "");
const FOREIGN = /^(新加坡商|港商|美商|台灣摩根|香港上海|美林|花旗|摩根大通|法銀|大和國泰|德意志|瑞士|渣打|法國興業|麥格理|野村|瑞銀|高盛|匯豐)/;
/** 外資照券商名稱判斷，其他都算本土（隔日沖分類第二期才做） */
export const kindOf = (n: string): "f" | "l" => (FOREIGN.test(n) ? "f" : "l");

function closeOf(code: string) {
  const { dates, s } = getDaily();
  const x = s.get(code);
  const idx = new Map(dates.map((d, i) => [d, i]));
  return (d: string) => { const i = idx.get(d); return i == null || !x ? NaN : x.c[i]; };
}
const r2 = (v: number) => Math.round(v * 100) / 100;
const yiOf = (lots: number, px: number) => (lots * px) / 1e5; // 張 × 價 → 億

/** 一檔一家分點逐日買進／賣出（沒進榜＝0） */
function perBroker(days: Day[], code: string) {
  const m = new Map<string, { b: number[]; s: number[] }>();
  days.forEach((d, i) => {
    for (const [id, b, s] of d.s.get(code)?.rows ?? []) {
      let x = m.get(id);
      if (!x) m.set(id, (x = { b: new Array(days.length).fill(0), s: new Array(days.length).fill(0) }));
      x.b[i] += b; x.s[i] += s;
    }
  });
  return m;
}
const streakOf = (net: number[]) => {
  let k = 0;
  const sg = Math.sign(net.at(-1) ?? 0);
  for (let i = net.length - 1; i >= 0 && sg && Math.sign(net[i]) === sg; i--) k++;
  return sg * k;
};
/** 估算成本＝買超那幾天收盤加權平均 */
const costOf = (net: number[], px: number[]) => {
  let a = 0, w = 0;
  net.forEach((v, i) => { if (v > 0 && px[i] > 0) { a += v * px[i]; w += v; } });
  return w ? r2(a / w) : null;
};

export function stockView(code: string, n: 1 | 5 | 20) {
  const { days: all, names } = getBrokerDays();
  if (!all.length) return { error: "還沒有分點資料" };
  const days = all.slice(-60);
  const last = days.at(-1)!;
  if (!last.s.has(code)) return { error: `${code} 沒有分點資料（成交值太小或不是股票）` };
  const { dates: dd, s } = getDaily();
  const ser = s.get(code)!;
  const px = closeOf(code);
  const close = days.map((d) => px(d.date));
  const m = perBroker(days, code);
  const L = days.length, R = Math.min(n, L);
  const range = days.slice(-R);
  const vol = range.reduce((a, d) => a + (d.s.get(code)?.vol ?? 0), 0);
  const nm = (id: string) => shortName(names.get(id) ?? id);

  // 期間買賣超表
  const agg = [...m].map(([id, x]) => {
    const b = x.b.slice(-R).reduce((p, q) => p + q, 0), se = x.s.slice(-R).reduce((p, q) => p + q, 0);
    return { id, n: nm(id), k: kindOf(names.get(id) ?? ""), buy: b, sell: se, net: b - se, pct: vol ? r2(((b - se) / vol) * 100) : 0 };
  });
  const buy = agg.filter((x) => x.net > 0).sort((a, b) => b.net - a.net).slice(0, 15);
  const sell = agg.filter((x) => x.net < 0).sort((a, b) => a.net - b.net).slice(0, 15);
  const buySum = buy.reduce((a, x) => a + x.net, 0), sellSum = -sell.reduce((a, x) => a + x.net, 0);
  const top5 = (a: typeof buy) => a.slice(0, 5).reduce((p, x) => p + Math.abs(x.net), 0);

  // 60 日每家分點的逐日買賣超，給分點 K 線用（期間進出最大的 30 家）
  const brokers = [...m].map(([id, x]) => {
    const net = x.b.map((b, i) => b - x.s[i]);
    const wavg = (a: number[]) => { let p = 0, w = 0; a.forEach((v, i) => { if (v > 0 && close[i] > 0) { p += v * close[i]; w += v; } }); return w ? r2(p / w) : null; };
    const g = x.b.slice(-R).reduce((p, q) => p + q, 0) + x.s.slice(-R).reduce((p, q) => p + q, 0);
    return { g, v: { id, n: nm(id), k: kindOf(names.get(id) ?? ""), net, sum: net.reduce((p, q) => p + q, 0), buyAvg: wavg(x.b), sellAvg: wavg(x.s), streak: streakOf(net), rangeNet: net.slice(-R).reduce((p, q) => p + q, 0) } };
  }).sort((a, b) => b.g - a.g).slice(0, 30).map((x) => x.v);

  // 熱力圖：近 20 日進出最大的 16 家
  const H = Math.min(20, L);
  const heat = [...m].map(([id, x]) => {
    const net = x.b.slice(-H).map((b, i) => b - x.s.slice(-H)[i]);
    const sum = net.reduce((p, q) => p + q, 0);
    const cost = costOf(net, close.slice(-H));
    return { id, n: nm(id), k: kindOf(names.get(id) ?? ""), net, sum, cost, buyDays: net.filter((v) => v > 0).length, streak: streakOf(net) };
  }).sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum)).slice(0, 16);

  // 當天賣方集中度：前五大賣家佔成交量 %，跟全市場同一天比百分位（第一期不扣價量因素）
  const sellConc = (d: Day, c: string) => {
    const x = d.s.get(c);
    if (!x?.vol) return null;
    const nets = x.rows.map(([, b, s]) => b - s).filter((v) => v < 0).sort((a, b) => a - b).slice(0, 5);
    return (-nets.reduce((a, v) => a + v, 0) / x.vol) * 100;
  };
  const todayConc = sellConc(last, code) ?? 0;
  const allConc = [...last.s.keys()].map((c) => sellConc(last, c)).filter((v): v is number => v != null);
  const pctile = allConc.length ? Math.round((allConc.filter((v) => v < todayConc).length / allConc.length) * 100) : null;
  const dayAgg = (d: Day) => (d.s.get(code)?.rows ?? []).map(([id, b, s]) => ({ id, net: b - s }));
  const today = dayAgg(last);
  const last5 = days.slice(-5);
  const sellers5 = today.filter((x) => x.net < 0).sort((a, b) => a.net - b.net).slice(0, 5).map((x) => ({ n: nm(x.id), pct: r2((-x.net / (last.s.get(code)!.vol || 1)) * 100) }));
  const buyers5 = today.filter((x) => x.net > 0).sort((a, b) => b.net - a.net).slice(0, 5)
    .map((x) => ({ id: x.id, n: nm(x.id), dots: last5.map((d) => dayAgg(d).some((y) => y.id === x.id && y.net > 0)) }));

  const bars = days.map((d) => { const j = dd.indexOf(d.date); return { date: d.date, o: ser.o[j], h: ser.h[j], l: ser.l[j], c: ser.c[j] }; });
  const lastC = close.at(-1)!;
  const pi = dd.indexOf(last.date);
  return {
    code, name: NAME.get(code) ?? code, close: lastC, chg: pi > 0 ? r2(((lastC - ser.c[pi - 1]) / ser.c[pi - 1]) * 100) : 0,
    from: range[0].date, to: last.date, days: R, dates: days.map((d) => d.date), bars,
    buy, sell, buySum, sellSum, vol,
    buyPct: vol ? r2((buySum / vol) * 100) : 0, sellPct: vol ? r2((sellSum / vol) * 100) : 0,
    top5Buy: top5(buy), top5Sell: top5(sell),
    conc: { pct: r2(todayConc), pctile, sellers: sellers5, buyers: buyers5 },
    brokers, heat: { dates: days.slice(-H).map((d) => d.date), rows: heat, close: lastC },
  };
}

export function marketView(date?: string) {
  const { days, names } = getBrokerDays();
  const di = date ? days.findIndex((d) => d.date === date) : days.length - 1;
  if (di < 0) return { error: "沒有這天的分點資料" };
  const day = days[di];
  const prev5 = days.slice(Math.max(0, di - 5), di);
  const { dates, s } = getDaily();
  const ix = dates.indexOf(day.date);
  const nm = (id: string) => shortName(names.get(id) ?? id);
  type P = { c: string; n: string; id: string; b: string; k: "f" | "l"; lots: number; pct: number; amt: number; chg: number; prev: number };
  const pairs: P[] = [];
  const hot: { c: string; n: string; val: number; chg: number; top: { n: string; lots: number } | null; bot: { n: string; lots: number } | null }[] = [];
  for (const [c, x] of day.s) {
    const se = s.get(c);
    if (!se) continue;
    const cl = se.c[ix], pc = se.c[ix - 1];
    const chg = pc ? r2(((cl - pc) / pc) * 100) : 0;
    const nets = x.rows.map(([id, b, sl]) => ({ id, net: b - sl }));
    for (const { id, net } of nets) {
      if (!net) continue;
      const prev = prev5.filter((d) => d.s.get(c)?.rows.some(([i2, b, sl]) => i2 === id && Math.sign(b - sl) === Math.sign(net))).length;
      pairs.push({ c, n: NAME.get(c) ?? c, id, b: nm(id), k: kindOf(names.get(id) ?? ""), lots: net, pct: x.vol ? r2((Math.abs(net) / x.vol) * 100) : 0, amt: r2(yiOf(net, cl)), chg, prev });
    }
    const top = nets.reduce((a, y) => (y.net > (a?.net ?? 0) ? y : a), null as { id: string; net: number } | null);
    const bot = nets.reduce((a, y) => (y.net < (a?.net ?? 0) ? y : a), null as { id: string; net: number } | null);
    hot.push({ c, n: NAME.get(c) ?? c, val: r2(se.val[ix] / 100), chg, top: top && { n: nm(top.id), lots: top.net }, bot: bot && { n: nm(bot.id), lots: -bot.net } });
  }
  return {
    date: day.date, dates: days.map((d) => d.date),
    hot: hot.sort((a, b) => b.val - a.val).slice(0, 30),
    bigBuy: pairs.filter((p) => p.lots > 0).sort((a, b) => b.amt - a.amt).slice(0, 30),
    bigSell: pairs.filter((p) => p.lots < 0).sort((a, b) => a.amt - b.amt).slice(0, 30),
    // 突然大買：一家分點買超 ≥ 當天成交量 15%，而且前 5 天都沒買這檔
    sudden: pairs.filter((p) => p.lots > 0 && p.pct >= 15 && p.prev === 0 && prev5.length).sort((a, b) => b.amt - a.amt),
  };
}

/** 河道：近 n 日各分點淨買賣金額（全市場＝億，個股＝張），買前 10、賣前 10，跟前一天同區間比名次 */
export function riverView(n: number, code?: string, to?: string) {
  const { days, names } = getBrokerDays();
  let end = to ? days.findIndex((d) => d.date === to) : days.length - 1;
  if (end < 0) end = days.length - 1;
  if (!days.length) return { error: "還沒有分點資料" };
  const { dates, s } = getDaily();
  const sum = (e: number) => {
    const m = new Map<string, number>();
    const daily = new Map<string, number[]>();
    const w = days.slice(Math.max(0, e - n + 1), e + 1);
    w.forEach((d, k) => {
      const ix = dates.indexOf(d.date);
      for (const [c, x] of code ? [[code, d.s.get(code)] as const] : d.s) {
        if (!x) continue;
        const px = s.get(c)?.c[ix] ?? NaN;
        if (!code && !(px > 0)) continue;
        for (const [id, b, sl] of x.rows) {
          const v = code ? b - sl : yiOf(b - sl, px);
          m.set(id, (m.get(id) ?? 0) + v);
          let a = daily.get(id);
          if (!a) daily.set(id, (a = new Array(w.length).fill(0)));
          a[k] += v;
        }
      }
    });
    return { m, daily, from: w[0]?.date, to: w.at(-1)?.date };
  };
  const cur = sum(end), prev = end > 0 ? sum(end - 1) : null;
  const rank = (m: Map<string, number>) => {
    const a = [...m].sort((x, y) => y[1] - x[1]);
    const r = new Map<string, number>();
    a.filter(([, v]) => v > 0).forEach(([id], i) => r.set(id, i + 1));
    a.filter(([, v]) => v < 0).reverse().forEach(([id], i) => r.set(id, -(i + 1)));
    return r;
  };
  const rc = rank(cur.m), rp = prev ? rank(prev.m) : null;
  const row = ([id, v]: [string, number]) => {
    const r = rc.get(id)!, p = rp?.get(id);
    return { id, n: shortName(names.get(id) ?? id), k: kindOf(names.get(id) ?? ""), v: r2(v), daily: cur.daily.get(id)!.map(r2), move: p && Math.sign(p) === Math.sign(r) ? Math.abs(p) - Math.abs(r) : null };
  };
  const all = [...cur.m].sort((a, b) => b[1] - a[1]);
  return {
    unit: code ? "張" : "億", code: code ?? null, name: code ? NAME.get(code) ?? code : null, n, from: cur.from, to: cur.to, dates: days.map((d) => d.date),
    buy: all.filter(([, v]) => v > 0).slice(0, 10).map(row),
    sell: all.filter(([, v]) => v < 0).reverse().slice(0, 10).map(row),
  };
}

/** 某家分點近 n 日在全市場買最多／賣最多的股票 */
export function brokerView(id: string, n: number) {
  const { days, names } = getBrokerDays();
  if (!days.length) return { error: "還沒有分點資料" };
  const { dates, s } = getDaily();
  const m = new Map<string, { lots: number; amt: number }>();
  const w = days.slice(-n);
  for (const d of w) {
    const ix = dates.indexOf(d.date);
    for (const [c, x] of d.s) for (const [i2, b, sl] of x.rows) {
      if (i2 !== id) continue;
      const y = m.get(c) ?? { lots: 0, amt: 0 };
      y.lots += b - sl; y.amt += yiOf(b - sl, s.get(c)?.c[ix] ?? 0);
      m.set(c, y);
    }
  }
  const rows = [...m].map(([c, y]) => ({ c, n: NAME.get(c) ?? c, lots: y.lots, amt: r2(y.amt) }));
  return {
    id, name: shortName(names.get(id) ?? id), k: kindOf(names.get(id) ?? ""), from: w[0].date, to: w.at(-1)!.date, n: w.length,
    buy: rows.filter((r) => r.lots > 0).sort((a, b) => b.amt - a.amt).slice(0, 20),
    sell: rows.filter((r) => r.lots < 0).sort((a, b) => a.amt - b.amt).slice(0, 20),
  };
}

/** 追蹤：每組「股票＋分點」近 10 日逐日買賣超、連買天數、近 5 日合計、估算成本 */
export function trackView(items: { c: string; id: string }[]) {
  const { days, names } = getBrokerDays();
  const w = days.slice(-60);
  return {
    dates: w.slice(-10).map((d) => d.date),
    rows: items.map(({ c, id }) => {
      const x = perBroker(w, c).get(id);
      const net = x ? x.b.map((b, i) => b - x.s[i]) : new Array(w.length).fill(0);
      const px = closeOf(c);
      const close = w.map((d) => px(d.date));
      return {
        c, n: NAME.get(c) ?? c, id, b: shortName(names.get(id) ?? id), k: kindOf(names.get(id) ?? ""),
        last10: net.slice(-10), sum5: net.slice(-5).reduce((a, v) => a + v, 0), sum20: net.slice(-20).reduce((a, v) => a + v, 0),
        streak: streakOf(net), cost: costOf(net.slice(-20), close.slice(-20)), close: close.at(-1) ?? null,
      };
    }),
  };
}

/** 名稱或代號找分點（搜尋框用） */
export function findBrokers(q: string) {
  const { names } = getBrokerDays();
  const out: { id: string; n: string }[] = [];
  for (const [id, n] of names) if (n.includes(q) || shortName(n).includes(q)) out.push({ id, n: shortName(n) });
  return out.slice(0, 10);
}
