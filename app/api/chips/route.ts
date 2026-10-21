import { getChips, getDaily, getFutures, getTdcc, lastIdx } from "@/lib/history";
import { BY_CODE } from "@/lib/universe";

const r2 = (v: number) => Math.round(v * 100) / 100;

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

// 籌碼：不帶參數 = 大盤法人、期貨選擇權、買賣超排行；?code=2330 = 個股籌碼
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  const chips = getChips();
  if (!chips.length) return Response.json({ error: "還沒有籌碼資料" }, { status: 404 });
  const last = chips.at(-1)!, prev = chips.at(-2);

  if (code) {
    const rows = chips.map((d) => ({ date: d.date, v: d.s[code] }));
    const cur = last.s[code], pv = prev?.s[code];
    const tdcc = getTdcc();
    const t1 = tdcc.at(-1), t0 = tdcc.at(-2);
    return Response.json({
      code, date: last.date,
      days: rows.slice(-20).map((x) => [x.date, x.v?.[0] ?? 0, x.v?.[1] ?? 0, x.v?.[2] ?? 0]),
      fDays: streak(rows.map((x) => x.v?.[0] ?? 0)), tDays: streak(rows.map((x) => x.v?.[1] ?? 0)),
      qfii: cur && cur[6] >= 0 ? { pct: cur[6], chg: pv && pv[6] >= 0 ? r2(cur[6] - pv[6]) : null } : null,
      margin: cur ? { bal: cur[3], chg: pv ? cur[3] - pv[3] : 0, use: cur[5] ? r2((cur[3] / cur[5]) * 100) : null, short: cur[4], shortChg: pv ? cur[4] - pv[4] : 0, ratio: cur[3] ? r2((cur[4] / cur[3]) * 100) : 0 } : null,
      dayTrade: cur && cur[8] >= 0 ? cur[8] : null,
      sbl: cur && cur[7] >= 0 ? { bal: cur[7], chg: pv && pv[7] >= 0 ? cur[7] - pv[7] : null } : null,
      tdcc: t1?.s[code] ? { date: t1.date, big: t1.s[code][0], holders: t1.s[code][1], bigChg: t0?.s[code] ? r2(t1.s[code][0] - t0.s[code][0]) : null, holdersChg: t0?.s[code] ? t1.s[code][1] - t0.s[code][1] : null } : null,
    });
  }

  // 大盤
  const series = chips.slice(-20).map((d) => ({ date: d.date, f: d.m.f ?? 0, t: d.m.t ?? 0, d: d.m.d ?? 0 }));
  const m = last.m;
  const fut = getFutures();
  const fk = Object.keys(fut).sort();
  const f1 = fut[fk.at(-1) ?? ""], f0 = fut[fk.at(-2) ?? ""];

  // 買賣超排行（張、金額億、連買／連賣天數）
  const { dates, s } = getDaily();
  const di = dates.indexOf(last.date);
  const closeOf = (c: string) => { const x = s.get(c); if (!x) return 0; const i = lastIdx(x.c, di >= 0 ? di : x.c.length - 1); return i >= 0 ? x.c[i] : 0; };
  const rank = (k: 0 | 1 | 2) => {
    const all = Object.entries(last.s).filter(([c]) => BY_CODE.has(c)).map(([c, v]) => {
      const lots = v[k];
      return { c, n: BY_CODE.get(c)!.n, lots, amt: r2((lots * 1000 * closeOf(c)) / 1e8), streak: streak(chips.map((d) => d.s[c]?.[k] ?? 0)) };
    });
    return {
      buy: all.filter((x) => x.lots > 0).sort((a, b) => b.lots - a.lots).slice(0, 50),
      sell: all.filter((x) => x.lots < 0).sort((a, b) => a.lots - b.lots).slice(0, 50),
    };
  };

  return Response.json({
    date: last.date,
    market: {
      f: m.f, t: m.t, d: m.d, dSelf: m.dSelf, dHedge: m.dHedge, total: r2((m.f ?? 0) + (m.t ?? 0) + (m.d ?? 0)),
      fStreak: streak(chips.map((d) => d.m.f ?? 0)), tStreak: streak(chips.map((d) => d.m.t ?? 0)),
      sum20: r2(series.reduce((a, x) => a + x.f + x.t + x.d, 0)),
      marginAmt: m.marginAmt, marginChg: prev?.m.marginAmt != null ? r2(m.marginAmt - prev.m.marginAmt) : null,
      shortLots: m.shortLots, shortChg: prev?.m.shortLots != null ? m.shortLots - prev.m.shortLots : null,
    },
    series,
    futures: f1 ? { date: fk.at(-1), ...f1, prev: f0 ?? null } : null,
    rank: { f: rank(0), t: rank(1), d: rank(2) },
  });
}
