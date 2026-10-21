"use client";
// 橫向一整排（類股按鈕等）：左右箭頭、滑鼠滾輪也能左右捲，選到的會自動捲進畫面
import { useEffect, useRef, useState } from "react";

export default function ScrollRow({ children, activeKey, className = "" }: { children: React.ReactNode; activeKey?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const check = () => { const e = ref.current; if (e) setEdge({ l: e.scrollLeft > 4, r: e.scrollLeft + e.clientWidth < e.scrollWidth - 4 }); };
  useEffect(() => {
    const e = ref.current;
    if (!e) return;
    check();
    const ro = new ResizeObserver(check);
    ro.observe(e);
    // 滾輪上下轉換成左右
    const wheel = (ev: WheelEvent) => {
      if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX) || e.scrollWidth <= e.clientWidth) return;
      ev.preventDefault();
      e.scrollLeft += ev.deltaY;
    };
    e.addEventListener("wheel", wheel, { passive: false });
    return () => { ro.disconnect(); e.removeEventListener("wheel", wheel); };
  });
  useEffect(() => { ref.current?.querySelector("[data-active=true]")?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }); }, [activeKey]);
  const slide = (d: number) => ref.current?.scrollBy({ left: d * (ref.current.clientWidth * 0.7), behavior: "smooth" });
  return (
    <div className={`relative flex items-center ${className}`}>
      {edge.l && <button aria-label="往左捲" onClick={() => slide(-1)} className="absolute left-0 z-10 h-full px-2 bg-gradient-to-r from-[var(--bg)] via-[var(--bg)] to-transparent text-text-2 hover:text-text text-lg">‹</button>}
      <div ref={ref} onScroll={check} className="scroll-x flex gap-2 py-0.5 min-w-0 flex-1">{children}</div>
      {edge.r && <button aria-label="往右捲" onClick={() => slide(1)} className="absolute right-0 z-10 h-full px-2 bg-gradient-to-l from-[var(--bg)] via-[var(--bg)] to-transparent text-text-2 hover:text-text text-lg">›</button>}
    </div>
  );
}
