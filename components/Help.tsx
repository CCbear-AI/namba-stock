"use client";
// 說明浮框：
//  <Help>…</Help>          圓圈問號，移過去才顯示說明（段落式說明用）
//  <Term tip="…">RVOL</Term> 名詞本身加虛線底線，移到字上就顯示說明（RVOL、量比這種名詞用，不另外放問號）
// 說明框畫在 body 最上層（portal＋fixed），不會被可捲動的表格、卡片切掉，並自動避開畫面邊緣。
import { useState } from "react";
import { createPortal } from "react-dom";

const W = 256; // 說明框寬度

function useTip(align: "left" | "right") {
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  // 從觸發的元素（事件的 currentTarget）量位置
  const show = (e: React.SyntheticEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const want = align === "right" ? r.right - W : r.left;
    // 下面空間不夠、上面比較寬時就往上開
    const below = window.innerHeight - r.bottom, above = r.top;
    const up = below < 220 && above > below;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: Math.max(8, Math.min(want, window.innerWidth - W - 8)), up });
  };
  const hide = () => setPos(null);
  const box = (children: React.ReactNode) => pos && createPortal(
    <span role="tooltip"
      className="pointer-events-none fixed z-[100] rounded-lg border border-line bg-panel-2 px-3 py-2 text-[12px] leading-relaxed text-text-2 font-normal shadow-lg whitespace-normal text-left"
      style={{ top: pos.top, left: pos.left, width: W, transform: pos.up ? "translateY(-100%)" : undefined, fontFamily: "var(--font-plex-sans), 'Noto Sans TC', sans-serif", letterSpacing: 0 }}>
      {children}
    </span>,
    document.body,
  );
  return { show, hide, box };
}

// align="right"：優先往左打開（問號靠畫面右邊時用）
export default function Help({ children, label = "說明", align = "left" }: { children: React.ReactNode; label?: string; align?: "left" | "right" }) {
  const t = useTip(align);
  return (
    <span className="relative inline-flex align-middle ml-1">
      <button type="button" aria-label={label} onMouseEnter={t.show} onMouseLeave={t.hide} onFocus={t.show} onBlur={t.hide}
        onClick={(e) => { e.stopPropagation(); t.show(e); }}
        className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-[#3a3f47] text-[10px] leading-none text-text-2 hover:text-text hover:border-text-2 focus:outline-none focus-visible:border-[var(--gold)] cursor-help">?</button>
      {t.box(children)}
    </span>
  );
}

/**
 * 名詞本身就是觸發點：虛線底線，移過去／點一下顯示說明。
 * plain：不加底線、點擊照常往外傳（用在標籤、可點的列或勾選框文字上，只靠滑鼠移過去看說明）
 */
export function Term({ tip, children, align = "left", plain = false }: { tip: React.ReactNode; children: React.ReactNode; align?: "left" | "right"; plain?: boolean }) {
  const t = useTip(align);
  return (
    <span tabIndex={plain ? undefined : 0} onMouseEnter={t.show} onMouseLeave={t.hide} onFocus={t.show} onBlur={t.hide}
      onClick={plain ? undefined : (e) => { e.stopPropagation(); t.show(e); }}
      className={plain ? "cursor-help" : "cursor-help underline decoration-dotted decoration-[#5a606a] underline-offset-[3px] focus:outline-none"}>
      {children}{t.box(tip)}
    </span>
  );
}
