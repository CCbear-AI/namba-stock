import { getDaily } from "@/lib/history";
import { BY_CODE } from "@/lib/universe";
import { ETFS } from "@/lib/etfs";
import { yahooBars } from "@/lib/yahoo";

// 相似股：?code=0050&n=20（最近 n 根）或 &from=2026-09-01&to=2026-10-20（自己框的一段）
// mode=now：全市場最近同樣根數的走勢跟框的那段最像的；mode=hist：今年以來全市場出現過的相似型態，以及之後 5／10／20 日怎麼走
const r2 = (v: number) => Math.round(v * 100) / 100;

/** 去掉平均、長度變 1 的向量；全部一樣（沒波動）回傳 null */
function norm(a: number[]) {
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  const d = a.map((v) => v - m);
  const l = Math.sqrt(d.reduce((s, v) => s + v * v, 0));
  return l > 1e-9 ? d.map((v) => v / l) : null;
}
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
/** 漲跌幅接近程度 0～1：同方向才算，幅度比開根號（漲 180% 跟漲 47% 約 0.5） */
function ampSim(p: number, q: number) {
  if (Math.sign(p) !== Math.sign(q) || !p || !q) return 0;
  return Math.sqrt(Math.min(Math.abs(p), Math.abs(q)) / Math.max(Math.abs(p), Math.abs(q)));
}
/** 只比日均成交值 3,000 萬以上的（近 20 個交易日，val 單位百萬） */
const MIN_VAL = 30;
const spark = (a: number[]) => { const lo = Math.min(...a), hi = Math.max(...a); return a.map((v) => r2(hi > lo ? (v - lo) / (hi - lo) : 0.5)); };

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = sp.get("code") ?? "";
  const mode = sp.get("mode") === "hist" ? "hist" : "now";
  const { dates, s } = getDaily();
  let me = s.get(code);
  // ETF 等不在日 K 檔裡（或 10/21 才開始收錄、前面都是空的）的，缺的日子用 Yahoo 日 K 對齊日期補
  if (!me || me.c.slice(-120).some(Number.isNaN)) {
    try {
      const bars = await yahooBars(`${code}.TW`, "1d");
      const by = new Map(bars.map((b) => [new Date(b.time * 1000).toISOString().slice(0, 10), b.close]));
      const c = dates.map((d, i) => (me && !Number.isNaN(me.c[i]) ? me.c[i] : by.get(d) ?? NaN));
      if (c.some((v) => !Number.isNaN(v))) me = { o: c, h: c, l: c, c, v: me?.v ?? c.map(() => NaN), val: me?.val ?? c.map(() => NaN) };
    } catch { /* 下面回錯誤 */ }
  }
  if (!me) return Response.json({ error: "找不到這檔的歷史資料" }, { status: 404 });

  // 決定比對區間（索引）
  let a: number, b: number;
  if (sp.get("from") && sp.get("to")) {
    a = dates.findIndex((d) => d >= sp.get("from")!);
    b = dates.findLastIndex((d) => d <= sp.get("to")!);
  } else {
    const n = Math.min(120, Math.max(5, Number(sp.get("n")) || 20));
    b = dates.length - 1;
    while (b > 0 && Number.isNaN(me.c[b])) b--;
    a = b - n + 1;
  }
  if (a < 0 || b - a < 4 || b - a > 119) return Response.json({ error: "區間要 5～120 根" }, { status: 400 });
  const n = b - a + 1;
  const target = me.c.slice(a, b + 1);
  if (target.some(Number.isNaN)) return Response.json({ error: "這段期間有停牌，換一段試試" }, { status: 400 });
  // 相似度＝形狀（對數價格的相關係數）80%＋漲跌幅接近程度 20%
  const tv = norm(target.map(Math.log))!;
  const tp = target[n - 1] / target[0] - 1;
  const score = (w: number[]) => { const v = norm(w.map(Math.log)); return v ? 0.8 * dot(tv, v) + 0.2 * ampSim(w[w.length - 1] / w[0] - 1, tp) : null; };
  const last = dates.length - 1;
  const liquid = (x: { val: number[] }) => x.val.slice(last - 19, last + 1).reduce((p, y) => p + (y || 0), 0) / 20 >= MIN_VAL;
  const base = {
    code, name: BY_CODE.get(code)?.n ?? ETFS[code] ?? code, from: dates[a], to: dates[b], a, b, n, pct: r2((target[n - 1] / target[0] - 1) * 100), spark: spark(target),
    // 整段歷史收盤（畫主圖、讓使用者自己框）
    history: { dates, closes: me.c.map((v) => (Number.isNaN(v) ? null : v)) },
  };

  if (mode === "now") {
    // 正在形成：不管左邊框的是哪一段，都拿全市場「最近同樣根數」來比（例如框 6/11–8/7 共 40 根，就比各檔最近 40 根）
    let e = dates.length - 1;
    while (e > 0 && ![...s.values()].some((x) => !Number.isNaN(x.c[e]))) e--;
    const from = dates[e - n + 1], to = dates[e];
    const out: { c: string; n: string; sim: number; pct: number; last: number; spark: number[]; from: string; to: string }[] = [];
    for (const [c, x] of s) {
      // 自己只有在框的是過去一段時才拿來比（比自己最近的走勢）
      if ((c === code && e === b) || !BY_CODE.has(c) || !liquid(x)) continue;
      const w = x.c.slice(e - n + 1, e + 1);
      if (w.some(Number.isNaN)) continue;
      const sim = score(w);
      if (sim != null && sim > 0.6) out.push({ c, n: BY_CODE.get(c)!.n, sim: Math.round(sim * 100), pct: r2((w[n - 1] / w[0] - 1) * 100), last: w[n - 1], spark: spark(w), from, to });
    }
    out.sort((p, q) => q.sim - p.sim);
    return Response.json({ ...base, mode, list: out.slice(0, 30) });
  }

  // 歷史相似：今年以來（且之後至少還有 5 天可以看）每檔取最像的一段
  const year = dates[b].slice(0, 4);
  const start = Math.max(0, dates.findIndex((d) => d >= `${year}-01-01`));
  const best: { c: string; n: string; sim: number; from: string; to: string; last: number; spark: number[]; after: (number | null)[] }[] = [];
  for (const [c, x] of s) {
    if (!BY_CODE.has(c) || !liquid(x)) continue;
    let top: (typeof best)[number] | null = null;
    for (let e = start + n - 1; e <= dates.length - 6; e++) {
      // 跟自己比的時候，排除跟目標區間重疊的
      if (c === code && e >= a - 5) break;
      const w = x.c.slice(e - n + 1, e + 1);
      if (Number.isNaN(w[0]) || Number.isNaN(w[n - 1]) || w.some(Number.isNaN)) continue;
      const sim = score(w);
      if (sim != null && sim > 0.75 && (!top || sim * 100 > top.sim)) {
        const after = [5, 10, 20].map((k) => (e + k < dates.length && !Number.isNaN(x.c[e + k]) ? r2((x.c[e + k] / w[n - 1] - 1) * 100) : null));
        top = { c, n: BY_CODE.get(c)!.n, sim: Math.round(sim * 100), from: dates[e - n + 1], to: dates[e], last: w[n - 1], spark: spark(x.c.slice(e - n + 1, Math.min(dates.length, e + 11)).map((y, i, arr) => (Number.isNaN(y) ? arr[i - 1] ?? w[n - 1] : y))), after };
      }
    }
    if (top) best.push(top);
  }
  best.sort((p, q) => q.sim - p.sim);
  const list = best.slice(0, 30);
  const stat = [0, 1, 2].map((k) => {
    const v = list.map((x) => x.after[k]).filter((y): y is number => y != null);
    return v.length ? { avg: r2(v.reduce((p, y) => p + y, 0) / v.length), up: Math.round((v.filter((y) => y > 0).length / v.length) * 100), n: v.length } : null;
  });
  return Response.json({ ...base, mode, list, stat });
}
