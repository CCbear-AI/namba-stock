"use client";
// 個股基本面：估值、月營收、季度獲利（資料 /api/fundamental，來源 FinMind）
import { usePoll } from "./hooks";
import { cls, num } from "./fmt";
import Help from "./Help";

type F = {
  error?: string; etf?: boolean;
  valuation: { date: string; per: number | null; pbr: number | null; yield: number; lo: number | null; hi: number | null; pos: number | null; level: string | null } | null;
  revenue: { year: number; month: number; value: number; yoy: number | null; ytdYoy: number | null; months: [string, number][] } | null;
  profit: { latest: string; eps4: number | null; gm: number | null; om: number | null; nm: number | null; quarters: { q: string; eps: number | null }[] } | null;
};
const sp = (v: number | null, d = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function Stat({ l, v, c }: { l: string; v: string; c?: number }) {
  return (
    <div>
      <div className="text-[12px] text-text-2">{l}</div>
      <div className={`mono text-lg ${c == null ? "" : cls(c)}`}>{v}</div>
    </div>
  );
}

/** 小長條圖：最後一根用金色，負值往下畫 */
function Bars({ data, unit }: { data: [string, number | null][]; unit: string }) {
  const max = Math.max(1e-9, ...data.map(([, v]) => Math.abs(v ?? 0)));
  const neg = data.some(([, v]) => (v ?? 0) < 0);
  return (
    <div className="mt-3">
      <div className="flex items-end gap-[3px] h-16">
        {data.map(([l, v], i) => {
          const h = (Math.abs(v ?? 0) / max) * (neg ? 50 : 100);
          const last = i === data.length - 1;
          return (
            <div key={l} className="flex-1 h-full flex flex-col justify-end" title={`${l}：${v == null ? "—" : num(v, 2)} ${unit}`}>
              {neg ? (
                <>
                  <div className="h-1/2 flex items-end"><div className="w-full rounded-t-sm" style={{ height: `${(v ?? 0) > 0 ? h * 2 : 0}%`, background: last ? "var(--gold)" : "var(--up)", opacity: last ? 1 : 0.55 }} /></div>
                  <div className="h-1/2"><div className="w-full rounded-b-sm" style={{ height: `${(v ?? 0) < 0 ? h * 2 : 0}%`, background: "var(--down)", opacity: 0.7 }} /></div>
                </>
              ) : (
                <div className="w-full rounded-t-sm" style={{ height: `${h}%`, background: last ? "var(--gold)" : "#5b6472" }} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-dim mono mt-1"><span>{data[0]?.[0]}</span><span>{data.at(-1)?.[0]}</span></div>
    </div>
  );
}

export default function Fundamental({ code }: { code: string }) {
  const { data: f } = usePoll<F>(`/api/fundamental?code=${code}`);
  if (!f) return <div className="sub px-4 pb-4 loading">基本面載入中…</div>;
  if (f.etf) return <div className="sub px-4 pb-4">ETF 沒有本益比、營收、財報這類基本面資料</div>;
  if (f.error) return <div className="sub px-4 pb-4">{f.error}</div>;
  const { valuation: v, revenue: r, profit: p } = f;
  return (
    <div className="grid gap-5 px-4 pb-4 md:grid-cols-3">
      <section>
        <div className="text-[13px] font-semibold mb-2">估值 {v && <span className="sub font-normal">{md(v.date)}</span>}</div>
        {v ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat l="本益比" v={v.per == null ? "虧損" : v.per.toFixed(1)} />
              <Stat l="股價淨值比" v={v.pbr == null ? "—" : v.pbr.toFixed(2)} />
              <Stat l="殖利率" v={`${v.yield.toFixed(2)}%`} />
            </div>
            {v.pos != null && (
              <div className="mt-4">
                <div className="flex items-center text-[12px] text-text-2">本益比在近一年的位置
                  <Help>拿今天的本益比，跟過去一年每天的本益比最低到最高比，看落在哪裡。前三分之一算偏低、後三分之一算偏高。</Help>
                  <b className={`ml-auto ${v.level === "偏高" ? "up" : v.level === "偏低" ? "down" : "text-text"}`}>{v.level}</b>
                </div>
                <div className="relative h-1.5 rounded bg-panel-2 mt-2">
                  <div className="absolute -top-[3px] w-3 h-3 rounded-full bg-[var(--gold)] -translate-x-1/2" style={{ left: `${v.pos * 100}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-dim mono mt-1"><span>{v.lo?.toFixed(1)}</span><span>{v.hi?.toFixed(1)}</span></div>
              </div>
            )}
          </>
        ) : <div className="sub">沒有估值資料</div>}
      </section>

      <section>
        <div className="text-[13px] font-semibold mb-2">月營收 {r && <span className="sub font-normal">{r.year} 年 {r.month} 月</span>}</div>
        {r ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat l={`${r.month} 月`} v={`${num(r.value, r.value >= 100 ? 0 : 1)} 億`} />
              <Stat l="年增" v={sp(r.yoy)} c={r.yoy ?? 0} />
              <Stat l="今年累計年增" v={sp(r.ytdYoy)} c={r.ytdYoy ?? 0} />
            </div>
            <Bars data={r.months} unit="億" />
          </>
        ) : <div className="sub">沒有月營收資料</div>}
      </section>

      <section>
        <div className="text-[13px] font-semibold mb-2">獲利 {p && <span className="sub font-normal">最新財報 {p.latest}</span>}</div>
        {p ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              <Stat l="近四季 EPS" v={p.eps4 == null ? "—" : p.eps4.toFixed(2)} c={p.eps4 ?? 0} />
              <Stat l="毛利率" v={p.gm == null ? "—" : `${p.gm.toFixed(1)}%`} />
              <Stat l="營益率" v={p.om == null ? "—" : `${p.om.toFixed(1)}%`} />
              <Stat l="淨利率" v={p.nm == null ? "—" : `${p.nm.toFixed(1)}%`} />
            </div>
            <Bars data={p.quarters.map((q) => [q.q, q.eps])} unit="元（EPS）" />
          </>
        ) : <div className="sub">沒有財報資料</div>}
      </section>
    </div>
  );
}
