"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ExportBtn from "./ExportBtn";
import { usePoll } from "./hooks";
import { cls, pct, price, num, hm } from "./fmt";
import type { Market } from "@/lib/types";
import universe from "@/data/universe.json";

const NAV = [
  { to: "/", label: "首頁", tip: "大盤、自選、排行與盤中動態" },
  { to: "/gainers", label: "漲幅排行", tip: "漲幅橫條、走勢預覽與多股比較" },
  { to: "/taiex", label: "大盤", tip: "指數、買賣力道、漲跌分布、貢獻點數、類股、國際行情" },
  { to: "/heatmap", label: "熱力圖", tip: "全市場漲跌一眼看完" },
  { to: "/sector", label: "類股 K 線", tip: "半導體、航運、金融等官方類股指數的 K 線與技術分析" },
  { to: "/flow-live", label: "即時資金流", tip: "盤中各板塊的主動買賣資金往哪裡流，可回放" },
  { to: "/watchlist", label: "自選股", tip: "自選群組、0050 權值股、創歷史新高" },
  { to: "/stock/2330", label: "個股", tip: "K 線、五檔、分時明細、籌碼" },
  { to: "/multi", label: "多股看盤", tip: "同時看多檔走勢，可帶入整個自選群組" },
  { to: "/radar", label: "破頂雷達", tip: "蜘蛛爬全市場，抓歷史新高、新低與即將破頂" },
  { to: "/pattern", label: "相似股", tip: "搜尋一檔股票、選一段走勢，到全市場排出形狀最像的" },
  { to: "/screener", label: "選股器", tip: "條件選股、新高新低" },
  { to: "/alerts", label: "提醒", tip: "到價、漲跌幅、法人與策略提醒" },
  { to: "/chips", label: "籌碼", tip: "法人與主力買賣超" },
  { to: "/limits", label: "漲跌停", tip: "漲停、跌停與打開" },
];

type U = { c: string; n: string };

export default function Header() {
  const path = usePathname();
  const { data } = usePoll<Market>("/api/market?lite=1", 20_000);
  const { data: fut } = usePoll<{ price: number; chg: number; pct: number } | null>("/api/fut", 20_000);
  return (
    <header className="sticky top-0 z-30 bg-[var(--bg)]/95 backdrop-blur border-b border-line">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-4 h-14 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span className="font-bold text-[17px] tracking-wide" style={{ fontFamily: "'Noto Serif TC', serif" }}>台股難波萬</span>
        </Link>
        <Nav path={path} />
        <Search />
        <span className="hidden md:inline-flex"><ExportBtn name="台股難波萬" label="匯出圖片" target={() => document.querySelector("main")} /></span>
      </div>
      <Ticker m={data} fut={fut} />
    </header>
  );
}

function Nav({ path }: { path: string }) {
  const ref = useRef<HTMLElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const check = () => { const e = ref.current; if (e) setEdge({ l: e.scrollLeft > 4, r: e.scrollLeft + e.clientWidth < e.scrollWidth - 4 }); };
  useEffect(() => {
    check();
    // 目前這頁捲到看得到
    ref.current?.querySelector("[aria-current=page]")?.scrollIntoView({ inline: "nearest", block: "nearest" });
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [path]);
  const slide = (d: number) => ref.current?.scrollBy({ left: d * 240, behavior: "smooth" });
  return (
    <div className="flex items-center flex-1 min-w-0">
      {edge.l && <button aria-label="向左滑動導覽" className="px-1 text-text-2 hover:text-text" onClick={() => slide(-1)}>‹</button>}
      <nav ref={ref} onScroll={check} aria-label="台股版選單" className="scroll-x flex gap-1 flex-1 min-w-0">
        {NAV.map((n) => {
          const on = n.to === "/" ? path === "/" : path.startsWith(n.to.split("/").slice(0, 2).join("/"));
          return (
            <Link key={n.to} href={n.to} title={n.tip} aria-current={on ? "page" : undefined} className={`px-3 py-1.5 rounded-full text-[13px] whitespace-nowrap ${on ? "bg-[#2a2416] text-[var(--gold-2)]" : "text-text-2 hover:text-text"}`}>
              {n.label}
            </Link>
          );
        })}
      </nav>
      {edge.r && <button aria-label="向右滑動導覽" className="px-1 text-text-2 hover:text-text" onClick={() => slide(1)}>›</button>}
    </div>
  );
}

function Ticker({ m, fut }: { m: Market | null; fut: { price: number; chg: number; pct: number } | null }) {
  if (!m?.indices) return <div className="h-8 border-t border-line" />;
  const name: Record<string, string> = { t00: "加權指數", o00: "櫃買指數", "0050": "元大台灣50" };
  const b = m.breadth;
  const items = (
    <>
      {m.indices.map((q) => (
        <span key={q.c} className="whitespace-nowrap">
          <span className="text-text-2">{name[q.c] ?? q.n}</span> {price(q.price)}{" "}
          <span className={cls(q.chg)}>{q.chg > 0 ? "+" : ""}{price(q.chg)} ({pct(q.pct)})</span>
        </span>
      ))}
      {fut?.price ? <span className="whitespace-nowrap"><span className="text-text-2">台指期近一</span> {num(fut.price)} <span className={cls(fut.chg)}>{fut.chg > 0 ? "+" : ""}{num(fut.chg)} ({pct(fut.pct)})</span></span> : null}
      <span className="whitespace-nowrap"><span className="text-text-2">成交金額</span> {num(b.value)} 億</span>
      <span className="whitespace-nowrap"><span className="text-text-2">漲</span> <span className="up">{b.up}</span> · <span className="text-text-2">跌</span> <span className="down">{b.down}</span> · <span className="text-text-2">平</span> {b.flat}</span>
      <span className="whitespace-nowrap"><span className="text-text-2">漲停</span> <span className="up">{b.limitUp}</span> · <span className="text-text-2">跌停</span> <span className="down">{b.limitDown}</span></span>
    </>
  );
  return (
    <div className="border-t border-line h-8 flex items-center">
      <div className="max-w-[1440px] w-full mx-auto px-3 sm:px-4 flex items-center gap-4 text-[12.5px] mono">
        {/* 跑馬燈：內容放兩份往左捲，滑鼠移上去暫停 */}
        <div className="marquee flex-1 min-w-0 overflow-hidden" aria-label="大盤跑馬燈">
          <div className="marquee-track">
            <div className="flex items-center gap-8 pr-8">{items}</div>
            <div className="flex items-center gap-8 pr-8" aria-hidden="true">{items}</div>
          </div>
        </div>
        <span className="whitespace-nowrap text-text-2 shrink-0">{m.stale ? <span className="text-[var(--gold-2)]">即時報價暫時中斷，顯示 {new Date(m.time + 8 * 3600e3).toISOString().slice(5, 10).replace("-", "/")} 收盤</span> : <>{m.open ? "盤中" : "已收盤"} {hm(m.time)}</>}</span>
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
