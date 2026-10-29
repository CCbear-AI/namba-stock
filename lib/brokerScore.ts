// 分點訊號成績單：每家分點「買超之後」股票的表現，跟全市場比
// 訊號＝某家分點某天在某檔淨買 ≥ 500 萬（有進那檔的買超前 15 名）。
// 跟單報酬＝隔天開盤買進，到 N 天後收盤（N＝1/5/10/20），扣掉同一段期間全市場等權平均（也是隔天開盤到 N 天後收盤）。
// 每家分點：訊號次數、平均超額報酬、勝率（超額 > 0 的比例）、前半段／後半段各自的平均（兩段都 > 0＝前後一致）。
import { getDaily } from "./history";
import { getBrokerDays, kindOf, shortName } from "./brokers";
import { clsOf } from "./brokerCls";
import universe from "@/data/universe.json";

const NAME = new Map((universe as { c: string; n: string }[]).map((u) => [u.c, u.n]));
const H = [1, 5, 10, 20] as const;
export type Horizon = (typeof H)[number];
const MIN_AMT = 0.05; // 億＝500 萬
const SHRINK = 20; // 排名用：平均 × 次數 ÷ (次數 + 20)，次數少的往後排，避免幾次好運就排第一
const r2 = (v: number) => Math.round(v * 100) / 100;

type Stat = { n: number; sum: number; win: number; n1: number; s1: number; n2: number; s2: number };
const empty = (): Stat => ({ n: 0, sum: 0, win: 0, n1: 0, s1: 0, n2: 0, s2: 0 });
type Board = { date: string; from: string; to: string; mid: string; b: Map<string, { amt: number; st: Record<Horizon, Stat> }> };

let hit: { key: string; v: Board } | null = null;
function build(): Board | null {
  const { days } = getBrokerDays();
  const L = days.length;
  if (L < 6) return null;
  if (hit?.key === days[L - 1].date) return hit.v;
  const { dates, s } = getDaily();
  const di = days.map((d) => dates.indexOf(d.date));
  // 全市場等權平均：第 k 天的隔天開盤 → 第 k+h 天收盤
  const mkt = days.map((_, k) => Object.fromEntries(H.map((h) => {
    if (k + h >= L) return [h, NaN];
    let sum = 0, n = 0;
    for (const c of days[k].s.keys()) {
      const x = s.get(c), o = x?.o[di[k + 1]], cl = x?.c[di[k + h]];
      if (o && cl && o > 0 && cl > 0) { sum += cl / o - 1; n++; }
    }
    return [h, n ? (sum / n) * 100 : NaN];
  })) as Record<Horizon, number>);
  const mid = Math.floor((L - 1) / 2); // 訊號日在 mid 以前＝前半段
  const b: Board["b"] = new Map();
  for (let k = 0; k < L - 1; k++) {
    for (const [c, d] of days[k].s) {
      const x = s.get(c);
      if (!x) continue;
      const px = x.c[di[k]], o = x.o[di[k + 1]];
      if (!(px > 0 && o > 0)) continue;
      for (const [id, buy, sell] of d.rows) {
        const amt = ((buy - sell) * px) / 1e5;
        if (amt < MIN_AMT) continue;
        let a = b.get(id);
        if (!a) b.set(id, (a = { amt: 0, st: { 1: empty(), 5: empty(), 10: empty(), 20: empty() } }));
        a.amt += amt;
        for (const h of H) {
          const cl = x.c[di[k + h]];
          if (k + h >= L || !(cl > 0) || !Number.isFinite(mkt[k][h])) continue;
          const ex = (cl / o - 1) * 100 - mkt[k][h];
          const t = a.st[h];
          t.n++; t.sum += ex; if (ex > 0) t.win++;
          if (k <= mid) { t.n1++; t.s1 += ex; } else { t.n2++; t.s2 += ex; }
        }
      }
    }
  }
  const v = { date: days[L - 1].date, from: days[0].date, to: days[L - 2].date, mid: days[mid].date, b };
  hit = { key: v.date, v };
  return v;
}

function rowOf(id: string, h: Horizon, names: Map<string, string>) {
  const a = build()?.b.get(id);
  const t = a?.st[h];
  if (!a || !t?.n) return null;
  const avg = t.sum / t.n;
  const nm = names.get(id) ?? id;
  return {
    id, n: shortName(nm), k: kindOf(nm), cls: clsOf(id), cnt: t.n, amt: r2(a.amt),
    avg: r2(avg), win: Math.round((t.win / t.n) * 100), score: r2((avg * t.n) / (t.n + SHRINK)),
    a1: t.n1 ? r2(t.s1 / t.n1) : null, a2: t.n2 ? r2(t.s2 / t.n2) : null,
    steady: t.n1 >= 5 && t.n2 >= 5 && Math.sign(t.s1) === Math.sign(t.s2) && t.s1 !== 0,
  };
}
export type ScoreRow = NonNullable<ReturnType<typeof rowOf>>;

/** 成績單：訊號至少 minN 次的分點，好的、差的各前 50；外加今天「好成績分點」買了什麼 */
export function scoreView(h: Horizon, minN: number) {
  const bd = build();
  if (!bd) return { error: "分點資料不夠（至少 6 個交易日）" };
  const { days, names } = getBrokerDays();
  const rows = [...bd.b.keys()].map((id) => rowOf(id, h, names)).filter((r): r is ScoreRow => !!r && r.cnt >= minN);
  const good = rows.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  const bad = rows.filter((r) => r.score < 0).sort((a, b) => a.score - b.score);
  // 今天的訊號：成績前 30、前後一致的分點，今天淨買 ≥ 500 萬
  const top = new Map(good.filter((r) => r.steady).slice(0, 30).map((r) => [r.id, r]));
  const { dates, s } = getDaily();
  const last = days.at(-1)!, ix = dates.indexOf(last.date);
  const today: { c: string; n: string; chg: number; id: string; b: string; k: string; lots: number; amt: number; avg: number; win: number; cnt: number }[] = [];
  for (const [c, d] of last.s) {
    const x = s.get(c);
    const px = x?.c[ix] ?? 0;
    if (!(px > 0)) continue;
    for (const [id, buy, sell] of d.rows) {
      const r = top.get(id), amt = ((buy - sell) * px) / 1e5;
      if (!r || amt < MIN_AMT) continue;
      today.push({ c, n: NAME.get(c) ?? c, chg: r2((px / x!.c[ix - 1] - 1) * 100), id, b: r.n, k: r.k, lots: buy - sell, amt: r2(amt), avg: r.avg, win: r.win, cnt: r.cnt });
    }
  }
  today.sort((a, b) => b.amt - a.amt);
  return {
    date: bd.date, from: bd.from, to: bd.to, mid: bd.mid, h, minN, total: rows.length,
    good: good.slice(0, 50), bad: bad.slice(0, 50), today: today.slice(0, 60),
  };
}

/** 單一分點的成績（分點彈出面板用），四個天期都給 */
export function brokerScore(id: string) {
  const bd = build();
  if (!bd) return null;
  const { names } = getBrokerDays();
  const rows = H.map((h) => ({ h, r: rowOf(id, h, names) }));
  if (!rows.some((x) => x.r)) return null;
  return { from: bd.from, to: bd.to, rows: rows.map(({ h, r }) => ({ h, cnt: r?.cnt ?? 0, avg: r?.avg ?? null, win: r?.win ?? null, steady: r?.steady ?? false })) };
}
