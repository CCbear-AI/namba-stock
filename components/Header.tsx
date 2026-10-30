"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ExportBtn from "./ExportBtn";
import { usePoll } from "./hooks";
import { cls, pct, price, num, hm } from "./fmt";
import type { Market } from "@/lib/types";
import universe from "@/data/universe.json";

type Item = { to: string; label: string; tip: string };
type Group = { label: string; items: Item[] };
/** 導覽分六大類：單一頁直接連結，多頁的點開下拉選單 */
const NAV: Group[] = [
  { label: "市場", items: [
    { to: "/", label: "首頁", tip: "大盤、自選、排行與盤中動態" },
    { to: "/taiex", label: "大盤", tip: "指數、買賣力道、漲跌分布、貢獻點數、類股、國際行情" },
    { to: "/heatmap", label: "熱力圖", tip: "全市場漲跌一眼看完" },
    { to: "/sector", label: "類股 K 線", tip: "半導體、航運、金融等官方類股指數的 K 線與技術分析" },
    { to: "/flow-live", label: "即時資金流", tip: "盤中各板塊的主動買賣資金往哪裡流，可回放" },
  ] },
  { label: "排行", items: [
    { to: "/gainers", label: "漲幅排行", tip: "漲幅橫條、走勢預覽與多股比較" },
    { to: "/limits", label: "漲跌停", tip: "漲停、跌停與打開" },
  ] },
  { label: "自選", items: [
    { to: "/watchlist", label: "自選股", tip: "自選群組、0050 權值股、創歷史新高、分點追蹤" },
    { to: "/multi", label: "多股看盤", tip: "同時看多檔走勢，可帶入整個自選群組" },
    { to: "/alerts", label: "提醒", tip: "到價、漲跌幅、法人與策略提醒" },
  ] },
  { label: "個股", items: [{ to: "/stock/2330", label: "個股", tip: "K 線、五檔、分時明細、籌碼" }] },
  { label: "籌碼", items: [
    { to: "/chips", label: "法人籌碼", tip: "法人與主力買賣超" },
    { to: "/brokers", label: "分點", tip: "券商分點進出：個股分點 K 線、全市場大額買賣、河道、換手（含 0050）、隔日沖、分點跟單成績單" },
  ] },
  { label: "選股", items: [
    { to: "/radar", label: "新高追蹤", tip: "逐檔掃描全市場，找出創歷史新高、新低與快要創新高的股票" },
    { to: "/screener", label: "選股器", tip: "條件選股、新高新低、依分點賣方集中度排序" },
    { to: "/pattern", label: "相似股", tip: "搜尋一檔股票、選一段走勢，到全市場排出形狀最像的" },
    { to: "/strategy", label: "AI 策略", tip: "說出選股想法，AI 畫成流程圖並回測，跟 0050 比" },
  ] },
];
/** 有滑鼠的裝置：移上去就打開，點按鈕不會又關掉 */
const hoverable = () => window.matchMedia("(hover: hover)").matches;
const isOn = (to: string, path: string) => (to === "/" ? path === "/" : path.startsWith(to.split("/").slice(0, 2).join("/")));

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
        <span className="hidden md:inline-flex"><ExportBtn name="台股難波萬" label="匯出圖片：整頁" target={() => document.querySelector("main")} /></span>
      </div>
      <Ticker m={data} fut={fut} />
    </header>
  );
}

function Nav({ path }: { path: string }) {
  const ref = useRef<HTMLElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  // 打開的下拉選單：第幾組＋按鈕位置（用 fixed 定位，才不會被橫向捲動的導覽列裁掉）
  const [open, setOpen] = useState<{ i: number; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const check = () => { const e = ref.current; if (e) setEdge({ l: e.scrollLeft > 4, r: e.scrollLeft + e.clientWidth < e.scrollWidth - 4 }); };
  useEffect(() => {
    check();
    ref.current?.querySelector("[aria-current=page]")?.scrollIntoView({ inline: "nearest", block: "nearest" });
    const close = () => setOpen(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("resize", check);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("resize", check); window.removeEventListener("scroll", close); window.removeEventListener("keydown", key); };
  }, [path]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!(e.target as Element).closest("[data-nav]")) setOpen(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const show = (i: number, el: HTMLElement) => { if (timer.current) clearTimeout(timer.current); const r = el.getBoundingClientRect(); setOpen({ i, x: r.left, y: r.bottom + 6 }); };
  const hide = () => { timer.current = setTimeout(() => setOpen(null), 180); };
  const keep = () => { if (timer.current) clearTimeout(timer.current); };
  const slide = (d: number) => ref.current?.scrollBy({ left: d * 240, behavior: "smooth" });
  const pill = (on: boolean) => `px-3 py-1.5 rounded-full text-[13px] whitespace-nowrap ${on ? "bg-[#2a2416] text-[var(--gold-2)]" : "text-text-2 hover:text-text"}`;
  const g = open && NAV[open.i];
  return (
    <div className="flex items-center flex-1 min-w-0">
      {edge.l && <button aria-label="向左滑動導覽" className="px-1 text-text-2 hover:text-text" onClick={() => slide(-1)}>‹</button>}
      <nav ref={ref} onScroll={() => { check(); setOpen(null); }} aria-label="台股版選單" className="scroll-x flex gap-1 flex-1 min-w-0">
        {NAV.map((grp, i) => {
          const cur = grp.items.find((n) => isOn(n.to, path));
          if (grp.items.length === 1) {
            const n = grp.items[0];
            return <Link key={grp.label} href={n.to} title={n.tip} aria-current={cur ? "page" : undefined} className={pill(!!cur)}>{grp.label}</Link>;
          }
          return (
            <button key={grp.label} data-nav aria-haspopup="menu" aria-expanded={open?.i === i} aria-current={cur ? "page" : undefined}
              title={grp.items.map((n) => n.label).join("、")}
              className={`${pill(!!cur || open?.i === i)} flex items-center gap-1`}
              onClick={(e) => (open?.i === i && !hoverable() ? setOpen(null) : show(i, e.currentTarget))}
              onMouseEnter={(e) => { if (hoverable()) show(i, e.currentTarget); }}
              onMouseLeave={hide}>
              {grp.label}{cur && cur.label !== grp.label && <span className="text-[11.5px] opacity-80">· {cur.label}</span>}
              <span className="text-[9px] opacity-60">▾</span>
            </button>
          );
        })}
      </nav>
      {edge.r && <button aria-label="向右滑動導覽" className="px-1 text-text-2 hover:text-text" onClick={() => slide(1)}>›</button>}
      {g && open && (
        <div data-nav role="menu" onMouseEnter={keep} onMouseLeave={hide} className="fixed z-50 card py-1.5 min-w-[220px] shadow-xl" style={{ left: Math.max(8, Math.min(open.x, window.innerWidth - 240)), top: open.y }}>
          {g.items.map((n) => {
            const on = isOn(n.to, path);
            return (
              <Link key={n.to} href={n.to} role="menuitem" onClick={() => setOpen(null)} className={`block px-3.5 py-2 hover:bg-panel-2 ${on ? "text-[var(--gold-2)]" : ""}`}>
                <div className="text-[13.5px]">{n.label}</div>
                <div className="sub text-[11.5px] leading-snug">{n.tip}</div>
              </Link>
            );
          })}
        </div>
      )}
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
        <span className="whitespace-nowrap text-text-2 shrink-0">{m.stale ? <span className="text-[var(--gold-2)]">即時報價暫時中斷，顯示 {new Date(m.time + 8 * 3600e3).toISOString().slice(5, 10).replace("-", "/")} 收盤</span> : <>{m.open ? `盤中 ${hm(m.time)}` : `已收盤 ${new Date(m.time + 8 * 3600e3).toISOString().slice(5, 10).replace("-", "/")} ${hm(m.time)}`}</>}</span>
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
