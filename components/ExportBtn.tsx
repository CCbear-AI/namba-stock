"use client";
import { useState } from "react";
import { exportNode } from "./exportImage";

/** 匯出圖片按鈕：target 沒給就匯出按鈕所在的 .card */
export default function ExportBtn({ name, target, label, icon = false }: { name: string; target?: () => HTMLElement | null; label?: string; icon?: boolean }) {
  const [busy, setBusy] = useState(false);
  const run = async (e: React.MouseEvent<HTMLButtonElement>) => {
    setBusy(true);
    try { await exportNode(target ? target() : (e.currentTarget.closest(".card") as HTMLElement), name); } finally { setBusy(false); }
  };
  const t = label ?? `把「${name}」存成圖片`;
  return icon ? (
    <button data-noexport title={t} aria-label={t} onClick={run} disabled={busy} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-text-2 hover:text-text hover:bg-panel-2">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3v10M6 9l4 4 4-4M4 16h12" /></svg>
    </button>
  ) : (
    <button data-noexport className="btn" onClick={run} disabled={busy}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3v10M6 9l4 4 4-4M4 16h12" /></svg>
      {busy ? "產生中…" : label ?? "匯出圖片"}
    </button>
  );
}
