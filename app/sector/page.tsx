"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import KChart from "@/components/KChart";
import { usePoll } from "@/components/hooks";
import { cls, pct, price } from "@/components/fmt";
import { industryGroup } from "@/lib/industries";
import type { SectorQuote } from "@/lib/sector";
import type { Market } from "@/lib/types";

/** 類股指數名稱 → 對應的產業別（成分股用） */
function members(short: string): (ind: string) => boolean {
  const s = short.replace(/^櫃買/, "");
  if (s === "電子工業" || s === "電子") return (ind) => industryGroup(ind) === "電子";
  if (s === "化學生技醫療") return (ind) => ind === "化學" || ind === "生技醫療";
  const alias: Record<string, string> = { 紡纖: "紡織纖維", 機械: "電機機械", 營建: "建材營造", 化工: "化學", 光電業: "光電", 電腦及週邊設備: "電腦及週邊", 文化創意: "文化創意" };
  const name = alias[s] ?? s;
  return (ind) => ind === name || ind.startsWith(name.slice(0, 2));
}

export default function SectorPage() {
  const { data } = usePoll<{ sectors: SectorQuote[] }>("/api/sectors", 30_000);
  const { data: m } = usePoll<Market>("/api/market", 30_000);
  const [market, setMarket] = useState<"tse" | "otc">("tse");
  const [id, setId] = useState("t24");
  const [stock, setStock] = useState<string | null>(null);
  const list = (data?.sectors ?? []).filter((s) => s.market === market);
  const cur = data?.sectors.find((s) => s.id === id);
  const cons = useMemo(() => {
    if (!cur) return [];
    const f = members(cur.short);
    return (m?.stocks ?? []).filter((s) => s.m === cur.market && f(s.ind)).sort((a, b) => b.cap - a.cap);
  }, [cur, m]);
  const target = stock ?? `sector:${id}`;
  const stockRow = stock ? m?.stocks.find((s) => s.c === stock) : null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">類股 K 線</h1>
        <div className="seg">
          <button className={market === "tse" ? "on" : ""} onClick={() => { setMarket("tse"); setId("t24"); setStock(null); }}>上市</button>
          <button className={market === "otc" ? "on" : ""} onClick={() => { setMarket("otc"); setId("o24"); setStock(null); }}>上櫃</button>
        </div>
        <span className="sub">證交所／櫃買中心官方類股指數，點右邊成分股可看個股並判讀超級支撐壓力</span>
      </div>
      <div className="scroll-x flex gap-2 pb-1">
        {list.map((s) => (
          <button key={s.id} onClick={() => { setId(s.id); setStock(null); }}
            className={`shrink-0 px-3 py-1.5 rounded-full border text-[13px] ${s.id === id ? "border-[var(--gold)] bg-[#2a2416] text-[var(--gold-2)]" : "border-line bg-panel hover:border-dim"}`}>
            {s.short} <span className={`mono ${cls(s.pct)}`}>{pct(s.pct)}</span>
          </button>
        ))}
        {!list.length && <span className="loading">類股載入中…</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="card overflow-hidden">
          <div className="px-4 pt-3 flex items-baseline gap-3 flex-wrap">
            {stock ? (
              <>
                <button className="btn !py-0.5" onClick={() => setStock(null)}>← 回 {cur?.short}</button>
                <Link href={`/stock/${stock}`} className="font-semibold text-lg hover:text-[var(--gold-2)]">{stockRow?.n ?? stock}</Link>
                <span className="mono text-text-2">{stock}</span>
                {stockRow && <span className={`mono ${cls(stockRow.chg)}`}>{price(stockRow.price)} {pct(stockRow.pct)}</span>}
              </>
            ) : cur && (
              <>
                <span className="font-semibold text-lg">{cur.name}</span>
                <span className={`mono text-xl ${cls(cur.pct)}`}>{price(cur.price)}</span>
                <span className={`mono ${cls(cur.pct)}`}>{pct(cur.pct)}</span>
              </>
            )}
          </div>
          {!stock && cur && cur.market === "otc" ? (
            <div className="h-[420px] flex items-center justify-center text-text-2 px-6 text-center">上櫃類股的歷史 K 線還沒有資料來源（第二期補上）。可以先點右邊成分股看個股 K 線。</div>
          ) : (
            <KChart key={target} code={target} prev={stock ? stockRow?.prev : cur?.prev} height={480} tfs={stock ? ["1m", "5m", "1d", "1wk", "1mo"] : ["1m", "5m", "1d", "1wk", "1mo"]} />
          )}
        </div>
        <div className="card flex flex-col">
          <div className="card-h">成分股 <span className="sub">{cons.length} 檔 · 依市值</span></div>
          <div className="scroll-y max-h-[540px] px-2 pb-2">
            <table className="tbl text-[13px]">
              <thead><tr><th>股票</th><th>股價</th><th>漲跌幅</th></tr></thead>
              <tbody>
                {cons.slice(0, 150).map((s) => (
                  <tr key={s.c} className={`click ${stock === s.c ? "bg-panel-2" : ""}`} onClick={() => setStock(s.c)}>
                    <td><span className="mono text-text-2 mr-2">{s.c}</span>{s.n}</td>
                    <td className={`mono ${cls(s.chg)}`}>{price(s.price)}</td>
                    <td className={`mono ${cls(s.pct)}`}>{pct(s.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
