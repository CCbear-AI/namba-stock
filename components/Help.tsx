"use client";
// 圓圈問號：滑鼠移過去（或用鍵盤／手機點一下）才顯示說明，讓版面乾淨
// align="right"：說明框往左打開（問號靠畫面右邊時用，才不會超出畫面）
export default function Help({ children, label = "說明", align = "left" }: { children: React.ReactNode; label?: string; align?: "left" | "right" }) {
  return (
    <span className="group relative inline-flex align-middle ml-1">
      <button type="button" aria-label={label}
        className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-[#3a3f47] text-[10px] leading-none text-text-2 hover:text-text hover:border-text-2 focus:outline-none focus-visible:border-[var(--gold)] cursor-help">?</button>
      <span role="tooltip"
        className={`pointer-events-none hidden group-hover:block group-focus-within:block absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-1.5 z-40 w-64 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[12px] leading-relaxed text-text-2 font-normal shadow-lg whitespace-normal text-left`}
        style={{ fontFamily: "var(--font-plex-sans), 'Noto Sans TC', sans-serif", letterSpacing: 0 }}>
        {children}
      </span>
    </span>
  );
}
