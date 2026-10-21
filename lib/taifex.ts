// 期交所即時行情：台指期近月
let fut: { at: number; v: Fut | null } | null = null;
export type Fut = { name: string; price: number; chg: number; pct: number; ref: number; time: string };
export async function txf(): Promise<Fut | null> {
  if (fut && Date.now() - fut.at < 15_000) return fut.v;
  try {
    const r = await fetch("https://mis.taifex.com.tw/futures/api/getQuoteList", {
      method: "POST",
      headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/json" },
      body: JSON.stringify({ MarketType: "0", SymbolType: "F", KindID: "1", CID: "TXF", ExpireMonth: "", RowSize: "全部", PageNo: "", SortColumn: "", AscDesc: "A" }),
      cache: "no-store",
    });
    const j = await r.json();
    const list = j.RtData?.QuoteList ?? [];
    const q = list.find((x: { SymbolID: string }) => !x.SymbolID.endsWith("-S"));
    // 夜盤時段（MarketType 1）先不處理，一般盤收盤後顯示最後成交
    const v = q ? { name: "台指期近一", price: Number(q.CLastPrice), chg: Number(q.CDiff), pct: Number(q.CDiffRate), ref: Number(q.CRefPrice), time: q.CTime } : null;
    fut = { at: Date.now(), v };
    return v;
  } catch { return fut?.v ?? null; }
}

