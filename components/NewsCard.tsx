"use client";
// 個股新聞與公告：最上面是 AI 近一週重點，下面切換 鉅亨網新聞／重大訊息（近 60 天，每則有 AI 一句話摘要，滑鼠移上去看原文主旨）
import { useState } from "react";
import { usePoll } from "./hooks";
import Help from "./Help";
import type { News } from "@/lib/news";
import type { SNews, Digest } from "@/lib/stockNews";

const TONE = { 多: ["偏多", "up"], 空: ["偏空", "down"], 中: ["中性", "text-text-2"] } as const;
const md = (t: number) => { const d = new Date(t + 8 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const url = (id: number) => `https://news.cnyes.com/news/id/${id}`;

export default function NewsCard({ code }: { code: string }) {
  const { data } = usePoll<{ items?: News[]; news?: SNews[]; digest?: Digest | null; error?: string }>(`/api/news?code=${code}`, 0);
  const [tab, setTab] = useState<"news" | "ann">("news");
  const [all, setAll] = useState(false);
  const items = data?.items ?? [];
  const news = data?.news ?? [];
  const dg = data?.digest;
  // 預設先藏例行公告（股東會日期、注意交易資訊這類）
  const main = items.filter((x) => (x.imp ?? 2) >= 2);
  const list = all ? items : main;
  const t = tab === "news" && !news.length && items.length ? "ann" : tab;
  return (
    <div className="card">
      <div className="card-h">
        <span className="inline-flex items-center">新聞與公告<Help>新聞來自鉅亨網台股新聞（標有這檔的報導），點標題看原文。重大訊息來自證交所、櫃買中心開放資料，每天早上放出前一個交易日的公告，所以會晚一天；每則的一句話摘要由學校 AI 根據原文撰寫，滑鼠移上去可看原文主旨。「近一週重點」是 AI 綜合近 7 天新聞與重大訊息寫的，每天早上更新；偏多／偏空只是 AI 對消息面的判讀，不構成買賣建議。</Help></span>
        <span className="sub mr-auto">近 60 天</span>
        <div className="seg"><button className={t === "news" ? "on" : ""} onClick={() => { setTab("news"); setAll(false); }}>新聞 {news.length || ""}</button><button className={t === "ann" ? "on" : ""} onClick={() => { setTab("ann"); setAll(false); }}>重大訊息 {main.length || ""}</button></div>
      </div>
      {!data ? <div className="sub px-4 pb-4 loading">載入中…</div> : (
        <div className="px-4 pb-3 grid gap-1 text-[13px]">
          {dg && (
            <div className="flex gap-2 items-baseline rounded-lg bg-panel-2 px-3 py-2 mb-1">
              <span className={`shrink-0 text-[11.5px] px-1.5 rounded border border-current/40 ${TONE[dg.tone][1]}`}>{TONE[dg.tone][0]}</span>
              <span><span className="text-[var(--gold-2)] mr-1.5">近一週重點</span>{dg.text}
                {dg.src.map((id, k) => <a key={id} href={url(id)} target="_blank" rel="noreferrer" className="ml-1.5 text-[12px] text-[var(--gold)] whitespace-nowrap">原文{dg.src.length > 1 ? k + 1 : ""}</a>)}
                <span className="sub ml-1.5">{dg.d.slice(5).replace("-", "/")}</span>
              </span>
            </div>
          )}
          {t === "news" ? (
            !news.length ? <div className="sub py-1">近期沒有鉅亨網新聞（資料從 2026/10/27 開始收集）</div> : <>
              {news.slice(0, all ? 40 : 8).map((x) => (
                <a key={x.id} href={url(x.id)} target="_blank" rel="noreferrer" title={x.s} className="flex items-baseline gap-2 py-1 border-b border-line/60 last:border-0 hover:text-[var(--gold-2)]">
                  <span className="mono text-text-2 shrink-0">{md(x.at)}</span>
                  <span className="min-w-0">{x.t}</span>
                </a>
              ))}
              {news.length > 8 && <button className="text-[13px] text-[var(--gold)] text-left pt-1" onClick={() => setAll(!all)}>{all ? "▾ 收起" : `▸ 全部 ${news.length} 則`}</button>}
            </>
          ) : (
            !items.length ? <div className="sub py-1">近 60 天沒有重大訊息（資料從 2026/10 開始收集）</div> : <>
              {list.slice(0, all ? 60 : 8).map((x, i) => (
                <div key={i} className="flex items-baseline gap-2 py-1 border-b border-line/60 last:border-0" title={x.title}>
                  <span className="mono text-text-2 shrink-0">{x.d.slice(5).replace("-", "/")}</span>
                  {x.tag && <span className={`chip shrink-0 !py-0 text-[11px] ${x.imp === 3 ? "!bg-[#3a1a1e] !text-[var(--up)]" : ""}`}>{x.tag}</span>}
                  <span className={`min-w-0 ${x.imp === 1 ? "text-text-2" : ""}`}>{x.sum || x.title}</span>
                </div>
              ))}
              {(items.length > main.length || main.length > 8) && (
                <button className="text-[13px] text-[var(--gold)] text-left pt-1" onClick={() => setAll(!all)}>{all ? "▾ 只看重要的" : `▸ 全部 ${items.length} 則（含例行公告）`}</button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
