"use client";
// 首頁「國際焦點」：每天早上美股收盤後 AI 整理的國際重點（scripts/world-focus.ts），每點附鉅亨網原文連結
import { usePoll } from "./hooks";
import { cls, pct, price } from "./fmt";
import Help from "./Help";
import Highlight from "./Highlight";

type Q = { s: string; n: string; price: number; chg: number; pct: number };
type World = {
  date: string; usDate: string; headline: string; tw: string; error?: string;
  points: { t: string; text: string; tone: "多" | "空" | "中"; src: number[] }[];
  quotes: Q[]; news: { n: number; id: number; title: string }[];
};

const KEY = ["^SOX", "^IXIC", "^GSPC", "TSM", "^TNX", "TWD=X"];
const SHORT: Record<string, string> = { "^SOX": "費半", "^IXIC": "那指", "^GSPC": "標普", TSM: "台積電ADR", "^TNX": "美債10年", "TWD=X": "美元/台幣" };
const TONE = { 多: ["利多", "up"], 空: ["利空", "down"], 中: ["中性", "text-text-2"] } as const;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function WorldFocus() {
  const { data: w } = usePoll<World>("/api/summary?kind=world", 10 * 60_000);
  const news = new Map((w?.news ?? []).map((x) => [x.n, x]));
  const quotes = KEY.map((s) => w?.quotes?.find((q) => q.s === s)).filter(Boolean) as Q[];
  return (
    <div className="card" id="world">
      <div className="card-h">國際焦點<span className="sub mr-auto">{w?.date && `${md(w.date)} · `}每天早上 07:00 更新</span>
        <Help align="right">美股收盤後（台灣週一～六早上 07:00），把國際行情、美股權值股漲跌、台積電 ADR 和鉅亨網國際新聞交給 AI，挑出台股開盤前該知道的幾件事。利多／利空是 AI 判斷對台股的可能影響，點「原文」可看新聞來源；不構成買賣建議。</Help>
      </div>
      <div className="px-4 pb-4 text-[13.5px] leading-relaxed">
        {w && !w.error ? (
          <>
            <div className="font-semibold text-[15px] mb-1.5"><Highlight text={w.headline} /></div>
            {quotes.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 text-[12.5px]">
                {quotes.map((q) => (
                  <span key={q.s} className="whitespace-nowrap"><span className="text-text-2">{SHORT[q.s]}</span>{" "}
                    {q.s === "^TNX"
                      ? <span className={cls(q.chg)}>{q.price.toFixed(2)}%（{q.chg > 0 ? "+" : ""}{Math.round(q.chg * 100)}bp）</span>
                      : <span className={cls(q.pct)}>{q.s === "TWD=X" ? `${q.price.toFixed(2)} ` : ""}{pct(q.pct)}</span>}
                    {q.s === "TSM" && <span className="text-text-2"> {price(q.price)}</span>}
                  </span>
                ))}
              </div>
            )}
            <ul className="space-y-1">
              {w.points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className={`shrink-0 text-[11.5px] leading-[20px] px-1.5 rounded border border-current/40 h-fit mt-[1px] ${TONE[p.tone][1]}`}>{TONE[p.tone][0]}</span>
                  <span>
                    {p.t && <span className="font-semibold">{p.t}｜</span>}<Highlight text={p.text} />
                    {p.src.map((n) => news.get(n)).filter(Boolean).map((x, k) => (
                      <a key={x!.id} href={`https://news.cnyes.com/news/id/${x!.id}`} target="_blank" rel="noreferrer" title={x!.title} className="ml-1.5 text-[12px] text-[var(--gold)] whitespace-nowrap">原文{p.src.length > 1 ? k + 1 : ""}</a>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            {w.tw && <div className="mt-2 text-text-2"><span className="text-[var(--gold-2)]">台股留意</span>　<Highlight text={w.tw} /></div>}
          </>
        ) : <div className="sub py-2">{w?.error ?? "載入中…"}（每天早上 07:00 更新）</div>}
      </div>
    </div>
  );
}
