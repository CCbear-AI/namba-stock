// 分點分類：用 data/brokers 近 70 個交易日，看每家分點「買超之後」的行為，分成七類
// 用法：npm run broker-class    輸出 data/broker-class.json
//
// 事件＝某家分點某天在某檔淨買（有進那檔的買超前 15 名）。每家分點統計（都依張數加權）：
//   隔日賣出率：買進的張數裡，隔天就在同一檔賣掉的比例（只看得到賣超前 15 名，實際可能更高）
//   續抱率：之後 5 天累計賣回不到買進量一半的事件比例
//   上漲日買進比例：買在當天上漲的張數比例
//   10 日超額報酬：買超那天收盤到 10 天後收盤的漲跌，扣掉同期間全市場平均（依金額加權）
// 分類（依序判斷，門檻是用 10/28 里長伯標好的約 20 家分點對過的）：
//   沒成績：可評分的事件不到 20 次
//   隔日沖：隔日賣出率 ≥ 25%
//   壞分點：10 日超額報酬 ≤ −1.5%
//   追漲：上漲日買進比例 ≥ 70%
//   跌時買：上漲日買進比例 < 40%
//   可靠放長：隔日賣出率 ≤ 10% 而且續抱率 ≥ 70%
//   放長：其他
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { getDaily } from "../lib/history";

const DIR = "data/brokers";
const files = readdirSync(DIR).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
type DayFile = { date: string; n: Record<string, string>; s: Record<string, (string | number)[]> };
const days = files.map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) as DayFile);
const names: Record<string, string> = {};
for (const d of days) Object.assign(names, d.n);

const { dates, s } = getDaily();
const di = days.map((d) => dates.indexOf(d.date));
const L = days.length;

// 每檔每天每家分點的淨買賣：net[c][id][k]
const net = new Map<string, Map<string, Float64Array>>();
days.forEach((d, k) => {
  for (const [c, a] of Object.entries(d.s)) {
    if (c.startsWith("00")) continue;
    let m = net.get(c);
    if (!m) net.set(c, (m = new Map()));
    for (let i = 1; i + 2 < a.length; i += 3) {
      const id = a[i] as string;
      let v = m.get(id);
      if (!v) m.set(id, (v = new Float64Array(L)));
      v[k] += (a[i + 1] as number) - (a[i + 2] as number);
    }
  }
});

// 全市場平均報酬（等權）：mkt[k][h] = 第 k 天收盤到 k+h 天收盤
const ret = (c: string, k: number, h: number) => {
  const x = s.get(c);
  if (!x || k + h >= L) return NaN;
  const a = x.c[di[k]], b = x.c[di[k + h]];
  return a > 0 && b > 0 ? (b / a - 1) * 100 : NaN;
};
const mkt = days.map((_, k) => [5, 10].map((h) => {
  let sum = 0, n = 0;
  for (const c of net.keys()) { const r = ret(c, k, h); if (Number.isFinite(r)) { sum += r; n++; } }
  return n ? sum / n : NaN;
}));

type Acc = { n5: number; hold: number; b: number; sold1: number; up: number; bw: number; xw: number; xs: number; rb: number; rs: number; rn: number };
const acc = new Map<string, Acc>();
const RECENT = L - 25;
for (const [c, m] of net) {
  const x = s.get(c);
  if (!x) continue;
  for (const [id, v] of m) {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { n5: 0, hold: 0, b: 0, sold1: 0, up: 0, bw: 0, xw: 0, xs: 0, rb: 0, rs: 0, rn: 0 }));
    for (let k = 0; k < L; k++) {
      if (v[k] <= 0) continue;
      const cl = x.c[di[k]], pc = x.c[di[k] - 1];
      if (cl > 0 && pc > 0) { a.bw += v[k]; if (cl > pc) a.up += v[k]; }
      if (k + 1 < L) {
        const sold = Math.min(Math.max(0, -v[k + 1]), v[k]);
        a.b += v[k]; a.sold1 += sold;
        if (k >= RECENT) { a.rb += v[k]; a.rs += sold; a.rn++; }
      }
      if (k + 5 < L) {
        a.n5++;
        let after = 0;
        for (let j = 1; j <= 5; j++) after += v[k + j];
        if (after > -0.5 * v[k]) a.hold++;
      }
      const r = ret(c, k, 10), mm = mkt[k][1];
      if (Number.isFinite(r) && Number.isFinite(mm) && cl > 0) { a.xs += (r - mm) * v[k] * cl; a.xw += v[k] * cl; }
    }
  }
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** 分點代號 → [分類, 隔日賣出率, 事件數, 續抱率, 10 日超額報酬%, 上漲日買進比例, 近 25 天隔日賣出率, 近 25 天事件數] */
const out: Record<string, [string, number, number, number, number, number, number, number]> = {};
const count: Record<string, number> = {};
for (const [id, a] of acc) {
  const sell1 = a.b ? a.sold1 / a.b : 0, hold = a.n5 ? a.hold / a.n5 : 0, x10 = a.xw ? a.xs / a.xw : 0, upR = a.bw ? a.up / a.bw : 0;
  const cls = a.n5 < 20 ? "none"
    : sell1 >= 0.25 ? "dt"
    : x10 <= -1.5 ? "bad"
    : upR >= 0.7 ? "chase"
    : upR < 0.4 ? "dip"
    : sell1 <= 0.1 && hold >= 0.7 ? "rel"
    : "long";
  count[cls] = (count[cls] ?? 0) + 1;
  out[id] = [cls, r3(sell1), a.n5, r3(hold), r3(x10), r3(upR), r3(a.rb ? a.rs / a.rb : 0), a.rn];
}
writeFileSync("data/broker-class.json", JSON.stringify({ asOf: days.at(-1)!.date, from: days[0].date, b: out }));
console.log("分點分類", days[0].date, "~", days.at(-1)!.date, Object.keys(out).length, "家", count);
