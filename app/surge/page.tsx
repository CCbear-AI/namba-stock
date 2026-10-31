"use client";
// 飆股：每晚程式掃全市場「起漲前兆」訊號（每個訊號都用過去一年資料回測過）、依分數排出名單，
// AI 替前 15 檔寫為什麼漲、誰在買、要留意什麼（scripts/surge.ts）；下面是訊號回測成績與過去名單的成績單
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePoll, useWatchlist } from "@/components/hooks";
import { cls, pct, price } from "@/components/fmt";
import Help, { Term } from "@/components/Help";
import Highlight from "@/components/Highlight";
import { SIG, type SurgeDay, type SigStat } from "@/lib/surgeSigs";

type Track = { date: string; days: number; n: number; ret: number; mkt: number; beat: number; hit: number; best: { c: string; n: string; ret: number } };
type Res = SurgeDay & { error?: string; dates: string[]; track: Track[] };

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const sg = (v: number, d = 2) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const RISK_TIP: Record<string, string> = {
  短線漲多: "近 5 日漲 20% 以上，或近 20 日漲 40% 以上",
  離月線太遠: "收盤比 20 日均線高 20% 以上，容易拉回",
  融資大增: "近 5 日融資餘額增加 15% 以上，籌碼跑到散戶手上",
};
const PAGE_HELP = "每個交易日晚上分點、融資資料進來後（約 22:00～23:30），程式用盤後資料掃全市場（近 20 日平均成交值 3,000 萬以上的個股），找出 12 種起漲前兆。每個訊號都先用過去的資料回測：出現後隔天開盤買、20 個交易日後扣掉全市場同期平均的報酬（超額報酬）。分數＝今天出現的訊號各自的歷史超額報酬加總（次數少的打折，回測是負的不加分）。今天收紅、分數最高的 30 檔列出來，前 15 檔由學校 AI 根據法人、融資、大戶、分點、月營收、新聞寫說明。只是幫你找出值得看的股票，不構成買賣建議。";
const BT_HELP = "回測方式：訊號出現那天收盤後，隔天開盤買進。超額報酬＝5 或 20 個交易日後收盤的報酬，減去全市場同一段期間的平均。勝率＝20 天超額報酬大於 0 的比例。飆 20%＝20 天內最高價曾經比買進價高 20%；跌 10%＝20 天內最低價曾經比買進價低 10%。同一檔同一個訊號 10 天內只算第一次。權重（加幾分）用前半段資料算；法人、融資、集保、分點的資料只有最近幾個月，改用全部期間並打更多折。";
const OOS_HELP = "驗證：用前半段資料決定每個訊號加幾分，再看後半段（沒用來決定分數的資料）裡，不同分數的股票之後表現如何。分數越高，20 天內飆 20% 的機率越高，但跌 10% 的機率也越高，代表這些股票波動大，不是穩賺。";

export default function Page() {
  const router = useRouter();
  const wl = useWatchlist();
  const [date, setDate] = useState<string | null>(null);
  const { data } = usePoll<Res>(`/api/surge${date ? `?date=${date}` : ""}`, 30 * 60_000);
  const ok = data && !data.error;
  const st = new Map((data?.bt?.stats ?? []).map((s) => [s.id, s]));
  const tip = (s?: SigStat) => s ? `${SIG[s.id].tip}。過去 ${s.n.toLocaleString()} 次：20 天後平均超額 ${sg(s.ex20)}%、20 天內飆 20% 機率 ${s.hit}%（全部股票 ${data?.bt.base.hit}%）、加 ${s.w} 分` : "";

  return (
    <div className="grid gap-4 grid-cols-[minmax(0,1fr)]">
      <div className="card">
        <div className="card-h text-[16px]">
          <span className="mr-auto flex items-center gap-1">飆股晚報<Help>{PAGE_HELP}</Help>
            {ok && <span className="sub ml-2">{md(data.date)} 收盤後{data.backfill ? (data.headline ? " · 回補（AI 只用當天以前的資料補寫）" : " · 回補名單（沒有 AI 說明）") : ""}</span>}
          </span>
          {ok && data.dates.length > 1 && (
            <select className="btn !py-1" value={date ?? data.date} onChange={(e) => setDate(e.target.value === data.dates[0] ? null : e.target.value)} aria-label="選日期">
              {data.dates.map((d) => <option key={d} value={d}>{md(d)}</option>)}
            </select>
          )}
          <Link href="/alerts" className="text-[13px] text-[var(--gold)]">推播到手機</Link>
        </div>
        <div className="px-4 pb-4 text-[13.5px] leading-relaxed">
          {!data ? <div className="sub loading py-2">載入中…</div> : data.error ? <div className="sub py-2">{data.error}（每個交易日晚上更新）</div> : data.headline ? (
            <>
              <div className="font-semibold text-[15px] mb-1.5"><Highlight text={data.headline} /></div>
              <ul className="list-disc pl-5 space-y-0.5">{data.points?.map((p, i) => <li key={i}><Highlight text={p} /></li>)}</ul>
              {data.watch && <div className="mt-2 text-text-2"><span className="text-[var(--gold-2)]">明天留意</span>　<Highlight text={data.watch} /></div>}
            </>
          ) : <div className="sub py-1">{data.backfill ? "這天是回補的名單，只有訊號與分數，沒有 AI 總評。" : "AI 總評還沒寫好，先看下面名單。"}</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-h">今天起漲、分數最高 {ok ? data.items.length : ""} 檔<span className="sub mr-auto">點股票看 K 線 · 訊號、風險移上去看定義</span></div>
        <div className="px-2 pb-3">
          {ok && !data.items.length && <div className="sub text-center py-8">這天沒有收紅又有加分訊號的股票</div>}
          {ok && data.items.map((x, k) => (
            <div key={x.c} className="px-2 py-2.5 border-t border-[#1c1f24] first:border-0 hover:bg-panel-2 rounded-lg cursor-pointer" onClick={() => router.push(`/stock/${x.c}`)}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="mono text-dim w-5 text-right">{k + 1}</span>
                <span className="min-w-[9.5rem]"><span className="mono text-text-2 mr-1.5">{x.c}</span><b>{x.n}</b><span className="sub ml-1.5">{x.ind}</span></span>
                <span className={`mono w-16 text-right ${cls(x.pct)}`}>{price(x.close)}</span>
                <span className={`mono w-16 text-right ${cls(x.pct)}`}>{pct(x.pct)}</span>
                <span className="flex items-center gap-1.5 w-28" title="飆股分數">
                  <span className="w-14 h-1.5 rounded bg-panel-2"><span className="block h-full rounded bg-[var(--gold)]" style={{ width: `${Math.min(100, (x.score / 15) * 100)}%` }} /></span>
                  <span className="mono text-[var(--gold-2)]">{x.score.toFixed(1)}</span>
                </span>
                <span className="flex flex-wrap gap-1 flex-1">
                  {x.sigs.map((g) => <Term key={g} plain tip={tip(st.get(g))}><span className="chip">{SIG[g].label}</span></Term>)}
                  {x.risk.map((r) => <Term key={r} plain tip={RISK_TIP[r] ?? r}><span className="chip !bg-[#14261d] !text-[var(--down)]">{r}</span></Term>)}
                </span>
                <span className="sub mono hidden md:inline">5日 <span className={cls(x.d5)}>{sg(x.d5, 1)}%</span> · 量比 {x.vr.toFixed(1)}x · {x.val.toFixed(1)} 億</span>
                <span onClick={(e) => e.stopPropagation()}>
                  <button className={`btn !py-0.5 ${wl.has(x.c) ? "on" : ""}`} onClick={() => wl.toggle(x.c)}>{wl.has(x.c) ? "已在自選" : "加入自選"}</button>
                </span>
              </div>
              {x.ai && (
                <div className="mt-1 ml-8 text-[13px] leading-relaxed">
                  <Highlight text={x.ai} />
                  {x.warn && <span className="text-text-2">　<span className="text-[var(--gold-2)]">留意</span> {x.warn}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card self-start">
          <div className="card-h"><span className="mr-auto flex items-center gap-1">訊號回測成績<Help>{BT_HELP}</Help>{ok && <span className="sub ml-2">{md(data.bt.from)}～{md(data.bt.to)} 的訊號（之後 20 天還沒走完的不算）</span>}</span></div>
          <div className="overflow-x-auto px-2 pb-3">
            <table className="tbl text-[13px]">
              <thead><tr><th>訊號</th><th>資料</th><th>次數</th><th>5 天超額</th><th>20 天超額</th><th>勝率</th><th>飆 20%</th><th>跌 10%</th><th>加分</th></tr></thead>
              <tbody>
                {ok && <tr><td className="text-text-2">全部股票（任選一天買）</td><td></td><td className="mono">{data.bt.base.n.toLocaleString()}</td><td>—</td><td>—</td><td>—</td><td className="mono">{data.bt.base.hit}%</td><td className="mono">{data.bt.base.drop}%</td><td></td></tr>}
                {ok && [...data.bt.stats].sort((a, b) => b.w - a.w).map((s) => (
                  <tr key={s.id}>
                    <td><Term tip={SIG[s.id].tip}>{SIG[s.id].label}</Term></td>
                    <td className="sub">{SIG[s.id].data}{s.from > data.bt.from ? `（${md(s.from)} 起）` : ""}</td>
                    <td className="mono">{s.n.toLocaleString()}</td>
                    <td className={`mono ${cls(s.ex5)}`}>{sg(s.ex5)}%</td>
                    <td className={`mono ${cls(s.ex20)}`}>{sg(s.ex20)}%</td>
                    <td className="mono">{s.win20}%</td>
                    <td className={`mono ${s.hit > data.bt.base.hit ? "text-[var(--gold-2)]" : ""}`}>{s.hit}%</td>
                    <td className="mono">{s.drop}%</td>
                    <td className="mono text-[var(--gold-2)]">{s.w ? s.w.toFixed(1) : <span className="sub">不加分</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 self-start min-w-0">
          <div className="card">
            <div className="card-h"><span className="mr-auto flex items-center gap-1">分數有沒有用<Help>{OOS_HELP}</Help>{ok && <span className="sub ml-2">{md(data.bt.mid)} 之後的資料驗證</span>}</span></div>
            <div className="overflow-x-auto px-2 pb-3">
              <table className="tbl text-[13px]">
                <thead><tr><th>分數</th><th>次數</th><th>20 天超額</th><th>飆 20%</th><th>跌 10%</th></tr></thead>
                <tbody>
                  {ok && data.bt.oos.map((b) => (
                    <tr key={b.label}><td>{b.label}</td><td className="mono">{b.n.toLocaleString()}</td><td className={`mono ${cls(b.ex20)}`}>{sg(b.ex20)}%</td><td className="mono">{b.hit}%</td><td className="mono">{b.drop}%</td></tr>
                  ))}
                  {ok && <tr><td className="text-text-2">全部股票</td><td className="mono">{data.bt.base.n.toLocaleString()}</td><td>—</td><td className="mono">{data.bt.base.hit}%</td><td className="mono">{data.bt.base.drop}%</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="mr-auto flex items-center gap-1">過去名單成績單<Help>每天名單前 10 名，隔天開盤買進、抱到最新收盤，跟全市場同一段期間的平均比。跑贏＝報酬比全市場平均好的檔數；飆 20%＝期間最高價曾比買進價高 20% 的檔數。最近幾天的期間短，參考就好。</Help></span></div>
            <div className="overflow-x-auto px-2 pb-3">
              <table className="tbl text-[13px]">
                <thead><tr><th>名單日</th><th>抱幾天</th><th>前 10 平均</th><th>全市場</th><th>跑贏</th><th>飆 20%</th><th>最強</th></tr></thead>
                <tbody>
                  {ok && data.track.map((t) => (
                    <tr key={t.date} className="click" onClick={() => setDate(t.date)}>
                      <td>{md(t.date)}</td><td className="mono">{t.days}</td>
                      <td className={`mono ${cls(t.ret)}`}>{sg(t.ret)}%</td><td className={`mono ${cls(t.mkt)}`}>{sg(t.mkt)}%</td>
                      <td className="mono">{t.beat}/{t.n}</td><td className="mono">{t.hit}</td>
                      <td><Link href={`/stock/${t.best.c}`} onClick={(e) => e.stopPropagation()}>{t.best.n} <span className={cls(t.best.ret)}>{sg(t.best.ret, 1)}%</span></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ok && !data.track.length && <div className="sub text-center py-6">累積中，明天開始有成績</div>}
            </div>
          </div>
        </div>
      </div>
      <div className="sub px-2">名單由程式依歷史回測挑出、AI 只負責寫說明，過去表現不代表未來，不構成買賣建議。</div>
    </div>
  );
}
