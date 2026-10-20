"use client";
import Link from "next/link";
import { useState } from "react";
import KChart from "@/components/KChart";
import { usePoll, useWatchlist } from "@/components/hooks";
import { cls, pct, price } from "@/components/fmt";
import type { Market } from "@/lib/types";

const DEFAULT = ["2330", "2317", "2454", "2308", "2382", "3231", "2303", "2881", "2603"];

export default function Multi() {
  const [n, setN] = useState(4);
  const wl = useWatchlist();
  const [codes, setCodes] = useState<string[]>(DEFAULT);
  const [tf, setTf] = useState<"1m" | "1d">("1m");
  const { data: m } = usePoll<Market>("/api/market", 20_000);
  const cols = n <= 2 ? "md:grid-cols-2" : n <= 4 ? "md:grid-cols-2" : "md:grid-cols-3";
  const shown = codes.slice(0, n);
  const [editing, setEditing] = useState<number | null>(null);
  const replace = (i: number, c: string) => {
    setEditing(null);
    if (c.trim()) setCodes((old) => { const x = [...old]; x[i] = c.trim(); return x; });
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">多股看盤</h1>
        <div className="seg">{[2, 4, 6, 9].map((k) => <button key={k} className={n === k ? "on" : ""} onClick={() => setN(k)}>{k} 檔</button>)}</div>
        <div className="seg"><button className={tf === "1m" ? "on" : ""} onClick={() => setTf("1m")}>當日</button><button className={tf === "1d" ? "on" : ""} onClick={() => setTf("1d")}>日 K</button></div>
        <div className="flex-1" />
        <button className="btn" disabled={!wl.list.length} onClick={() => setCodes([...wl.list, ...DEFAULT].slice(0, 9))}>帶入自選股{wl.list.length ? `（${wl.list.length}）` : ""}</button>
      </div>
      <div className={`grid gap-4 ${cols}`}>
        {shown.map((c, i) => {
          const r = m?.stocks.find((s) => s.c === c);
          return (
            <div key={`${c}-${tf}-${i}`} className="card overflow-hidden">
              <div className="px-4 pt-3 flex items-baseline gap-2">
                <Link href={`/stock/${c}`} className="font-semibold hover:text-[var(--gold-2)]">{r?.n ?? c}</Link>
                <span className="mono text-text-2 text-[12px]">{c}</span>
                {r && <span className={`mono ${cls(r.chg)}`}>{price(r.price)} {pct(r.pct)}</span>}
                {editing === i ? (
                  <input autoFocus defaultValue={c} placeholder="代號" className="ml-auto w-20 bg-panel-2 border border-line rounded px-2 text-[12px]"
                    onKeyDown={(e) => { if (e.key === "Enter") replace(i, e.currentTarget.value); if (e.key === "Escape") setEditing(null); }}
                    onBlur={(e) => replace(i, e.currentTarget.value)} />
                ) : <button className="ml-auto text-text-2 hover:text-text text-[12px]" onClick={() => setEditing(i)}>換股</button>}
              </div>
              <KChart key={tf} code={c} prev={r?.prev} height={n >= 6 ? 200 : 260} tfs={[tf]} defaultTf={tf} showVolume={false} compact />
            </div>
          );
        })}
      </div>
    </div>
  );
}
