import fs from "node:fs";
import path from "node:path";
import { getDaily } from "@/lib/history";
import type { SurgeDay } from "@/lib/surgeSigs";

// 飆股晚報（scripts/surge.ts 產生的 data/surge/日期.json）；?date= 看某一天，預設最新一份
// 另外回傳「成績單」：過去每天名單前 10 名，隔天開盤買到最新收盤的平均報酬，跟全市場同期平均比
const DIR = path.join(process.cwd(), "data", "surge");
const TOP = 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

let memo: { key: string; v: unknown } | null = null;

function track(files: string[]) {
  const { dates, s } = getDaily();
  const N = dates.length, last = N - 1;
  return files.map((f) => f.slice(0, 10)).filter((d) => d < dates[last]).slice(-30).reverse().map((d) => {
    const day: SurgeDay = JSON.parse(fs.readFileSync(path.join(DIR, `${d}.json`), "utf8"));
    const i = dates.indexOf(d);
    if (i < 0 || i + 1 > last) return null;
    // 全市場等權平均（有成交的個股）
    let ms = 0, mn = 0;
    for (const [c, x] of s) { if (c.startsWith("00")) continue; const a = x.o[i + 1], b = x.c[last]; if (a > 0 && b > 0) { ms += b / a - 1; mn++; } }
    const mkt = mn ? (ms / mn) * 100 : 0;
    const rows = day.items.slice(0, TOP).map((it) => {
      const x = s.get(it.c);
      const a = x?.o[i + 1], b = x?.c[last];
      let hi = 0;
      if (x) for (let k = i + 1; k <= last; k++) if (x.h[k] > hi) hi = x.h[k];
      return a && b && a > 0 && b > 0 ? { c: it.c, n: it.n, ret: (b / a - 1) * 100, max: (hi / a - 1) * 100 } : null;
    }).filter((r): r is NonNullable<typeof r> => !!r);
    if (!rows.length) return null;
    const best = rows.reduce((p, q) => (q.ret > p.ret ? q : p));
    return {
      date: d, days: last - i, n: rows.length,
      ret: r2(rows.reduce((t, r) => t + r.ret, 0) / rows.length), mkt: r2(mkt),
      beat: rows.filter((r) => r.ret > mkt).length, hit: rows.filter((r) => r.max >= 20).length,
      best: { c: best.c, n: best.n, ret: r2(best.ret) },
    };
  }).filter(Boolean);
}

export async function GET(req: Request) {
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
  if (!files.length) return Response.json({ error: "還沒有飆股晚報" }, { status: 404 });
  const want = new URL(req.url).searchParams.get("date");
  const file = want && files.includes(`${want}.json`) ? `${want}.json` : files[files.length - 1];
  const key = `${files.length}:${files.at(-1)}:${getDaily().dates.at(-1)}:${fs.statSync(path.join(DIR, files.at(-1)!)).mtimeMs}`;
  if (memo?.key !== key) memo = { key, v: track(files) };
  const day: SurgeDay = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
  return Response.json({ ...day, dates: files.map((f) => f.slice(0, 10)).reverse(), track: memo.v });
}
