"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { usePoll } from "./hooks";
import { cls, pct, price, num, hm } from "./fmt";
import type { Market } from "@/lib/types";
import universe from "@/data/universe.json";

const NAV = [
  { to: "/", label: "首頁" },
  { to: "/stock/2330", label: "個股" },
  { to: "/heatmap", label: "熱力圖" },
  { to: "/sector", label: "類股 K 線" },
  { to: "/flow-live", label: "即時資金流" },
  { to: "/multi", label: "多股看盤" },
];

type U = { c: string; n: string };

export default function Header() {
  const path = usePathname();
  const { data } = usePoll<Market>("/api/market?lite=1", 20_000);
  return (
    <header className="sticky top-0 z-30 bg-[var(--bg)]/95 backdrop-blur border-b border-line">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-4 h-14 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span className="font-bold text-[17px] tracking-wide" style={{ fontFamily: "'Noto Serif TC', serif" }}>台股難波萬</span>
        </Link>
        <nav className="scroll-x flex gap-1 flex-1 min-w-0">
          {NAV.map((n) => {
            const on = n.to === "/" ? path === "/" : path.startsWith(n.to.split("/").slice(0, 2).join("/"));
            return (
              <Link key={n.to} href={n.to} className={`px-3 py-1.5 rounded-full text-[13px] whitespace-nowrap ${on ? "bg-[#2a2416] text-[var(--gold-2)]" : "text-text-2 hover:text-text"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Search />
      </div>
      <Ticker m={data} />
    </header>
  );
}

function Ticker({ m }: { m: Market | null }) {
  if (!m?.indices) return <div className="h-8 border-t border-line" />;
  const name: Record<string, string> = { t00: "加權指數", o00: "櫃買指數", "0050": "元大台灣50" };
  const b = m.breadth;
  return (
    <div className="border-t border-line h-8 flex items-center">
      <div className="max-w-[1440px] w-full mx-auto px-3 sm:px-4 scroll-x flex items-center gap-6 text-[12.5px] mono">
        {m.indices.map((q) => (
          <span key={q.c} className="whitespace-nowrap">
            <span className="text-text-2">{name[q.c] ?? q.n}</span> {price(q.price)}{" "}
            <span className={cls(q.chg)}>{q.chg > 0 ? "+" : ""}{price(q.chg)} ({pct(q.pct)})</span>
          </span>
        ))}
        <span className="whitespace-nowrap"><span className="text-text-2">成交金額</span> {num(b.value)} 億</span>
        <span className="whitespace-nowrap"><span className="text-text-2">漲</span> <span className="up">{b.up}</span> · <span className="text-text-2">跌</span> <span className="down">{b.down}</span> · <span className="text-text-2">平</span> {b.flat}</span>
        <span className="whitespace-nowrap text-text-2 ml-auto">{m.open ? "盤中" : "已收盤"} {hm(m.time)}</span>
      </div>
    </div>
  );
}

function Search() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const hits = useMemo(() => {
    const s = q.trim();
    if (!s) return [];
    return (universe as U[]).filter((u) => u.c.startsWith(s) || u.n.includes(s)).slice(0, 8);
  }, [q]);
  const go = (c: string) => { setQ(""); setOpen(false); router.push(`/stock/${c}`); };
  return (
    <div className="relative shrink-0">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Enter") go(hits[0]?.c ?? q.trim()); }}
        placeholder="代號 / 名稱"
        className="w-32 sm:w-48 bg-panel-2 border border-line rounded-full px-3 py-1.5 text-[13px] outline-none focus:border-[var(--gold)]"
      />
      {open && hits.length > 0 && (
        <div className="absolute right-0 mt-1 w-56 card overflow-hidden z-40">
          {hits.map((h) => (
            <button key={h.c} onMouseDown={() => go(h.c)} className="w-full text-left px-3 py-2 hover:bg-panel-2 flex gap-3">
              <span className="mono text-text-2">{h.c}</span><span>{h.n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
