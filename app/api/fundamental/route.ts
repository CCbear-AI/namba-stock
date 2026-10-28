import { ETFS } from "@/lib/etfs";

// 個股基本面：估值（本益比/淨值比/殖利率）、月營收、季度獲利。資料來源 FinMind（證交所、櫃買、公開資訊觀測站整理）
// 免金鑰每小時 300 次；有設 FINMIND_TOKEN 就帶上（600 次）。每檔結果快取 6 小時，自用夠
const API = "https://api.finmindtrade.com/api/v4/data";
const r2 = (v: number) => Math.round(v * 100) / 100;

type Row = Record<string, string | number>;
async function fm(dataset: string, code: string, start: string): Promise<Row[]> {
  const token = process.env.FINMIND_TOKEN?.trim();
  const r = await fetch(`${API}?dataset=${dataset}&data_id=${code}&start_date=${start}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    next: { revalidate: 6 * 3600 },
  });
  const j = await r.json();
  if (j.status !== 200) throw new Error(j.msg || `FinMind ${dataset} ${j.status}`);
  return j.data;
}

const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!/^\d{4,6}[A-Z]?$/.test(code)) return Response.json({ error: "代號格式不對" }, { status: 400 });
  if (ETFS[code] || code.startsWith("00")) return Response.json({ code, etf: true });

  try {
    const [perRows, revRows, finRows] = await Promise.all([
      fm("TaiwanStockPER", code, ago(370)),
      fm("TaiwanStockMonthRevenue", code, ago(800)),
      fm("TaiwanStockFinancialStatements", code, ago(900)),
    ]);

    // 估值：本益比在近一年的位置（虧損時本益比是 0，不算）
    let valuation = null;
    const last = perRows.at(-1);
    if (last) {
      const pers = perRows.map((r) => Number(r.PER)).filter((v) => v > 0);
      const per = Number(last.PER) || null;
      const lo = pers.length ? Math.min(...pers) : null, hi = pers.length ? Math.max(...pers) : null;
      const pos = per != null && lo != null && hi != null && hi > lo ? (per - lo) / (hi - lo) : null;
      valuation = {
        date: String(last.date), per, pbr: Number(last.PBR) || null, yield: Number(last.dividend_yield),
        lo, hi, pos: pos == null ? null : r2(pos), level: pos == null ? null : pos < 1 / 3 ? "偏低" : pos > 2 / 3 ? "偏高" : "中間",
      };
    }

    // 月營收：最近 13 個月、年增、今年累計年增
    let revenue = null;
    if (revRows.length) {
      const by = new Map(revRows.map((r) => [`${r.revenue_year}-${r.revenue_month}`, Number(r.revenue)]));
      const L = revRows.at(-1)!;
      const y = Number(L.revenue_year), m = Number(L.revenue_month);
      const get = (yy: number, mm: number) => by.get(`${yy}-${mm}`);
      const lastYear = get(y - 1, m);
      let cur = 0, prev = 0, ok = true;
      for (let i = 1; i <= m; i++) {
        const a = get(y, i), b = get(y - 1, i);
        if (a == null || b == null) { ok = false; break; }
        cur += a; prev += b;
      }
      revenue = {
        year: y, month: m, value: r2(Number(L.revenue) / 1e8),
        yoy: lastYear ? r2((Number(L.revenue) / lastYear - 1) * 100) : null,
        ytdYoy: ok && prev ? r2((cur / prev - 1) * 100) : null,
        months: revRows.slice(-13).map((r) => [`${String(r.revenue_year).slice(2)}/${String(r.revenue_month).padStart(2, "0")}`, r2(Number(r.revenue) / 1e8)] as [string, number]),
      };
    }

    // 季度獲利：EPS、三率（金融股沒有毛利，給 null）
    let profit = null;
    const qs = new Map<string, Record<string, number>>();
    for (const r of finRows) {
      const d = String(r.date);
      if (!qs.has(d)) qs.set(d, {});
      qs.get(d)![String(r.type)] = Number(r.value);
    }
    const quarters = [...qs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => {
      const rev = v.Revenue;
      const ratio = (x: number | undefined) => (rev && x != null ? r2((x / rev) * 100) : null);
      return {
        q: `${d.slice(2, 4)}Q${Math.ceil(Number(d.slice(5, 7)) / 3)}`,
        eps: v.EPS ?? null, gm: ratio(v.GrossProfit), om: ratio(v.OperatingIncome), nm: ratio(v.IncomeAfterTaxes),
      };
    }).slice(-8);
    if (quarters.length) {
      const l4 = quarters.slice(-4);
      const L = quarters.at(-1)!;
      profit = {
        latest: L.q, eps4: l4.length === 4 && l4.every((q) => q.eps != null) ? r2(l4.reduce((a, q) => a + q.eps!, 0)) : null,
        gm: L.gm, om: L.om, nm: L.nm, quarters,
      };
    }

    return Response.json({ code, valuation, revenue, profit }, { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=21600" } });
  } catch (e) {
    return Response.json({ error: `基本面資料抓不到：${(e as Error).message}` }, { status: 502 });
  }
}
