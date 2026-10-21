"use client";
// 搜尋股票（代號或名稱），選到後呼叫 onPick
import { useMemo, useState } from "react";
import universe from "@/data/universe.json";
import { ETFS } from "@/lib/etfs";

type U = { c: string; n: string; ind: string };
const ALL: U[] = [...(universe as U[]), ...Object.entries(ETFS).map(([c, n]) => ({ c, n, ind: "ETF" }))];
export const NAME = new Map(ALL.map((u) => [u.c, u.n]));

export default function StockPicker({ onPick, placeholder = "搜尋股票：代號或名稱，例如 2317、鴻海", className = "", keep = false, autoFocus = false }: { onPick: (c: string) => void; placeholder?: string; className?: string; keep?: boolean; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const s = q.trim();
    if (!s) return [];
    return ALL.filter((u) => u.c.startsWith(s) || u.n.includes(s)).slice(0, 8);
  }, [q]);
  const pick = (c: string) => { onPick(c); setQ(keep ? `${c} ${NAME.get(c) ?? ""}` : ""); setOpen(false); };
  return (
    <div className={`relative ${className}`}>
      <input value={q} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) pick(hits[0].c); }}
        className="w-full bg-panel-2 border border-line rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--gold)]" />
      {open && hits.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 card overflow-hidden z-40">
          {hits.map((h) => (
            <button key={h.c} onMouseDown={() => pick(h.c)} className="w-full text-left px-3 py-2 hover:bg-panel-2 flex gap-3">
              <span className="mono text-text-2">{h.c}</span><span>{h.n}</span><span className="sub ml-auto">{h.ind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
