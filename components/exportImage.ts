"use client";
// 把畫面上的一塊存成 PNG（標了 data-noexport 的元素不會出現在圖裡）
import { toPng } from "html-to-image";

export async function exportNode(el: HTMLElement | null, name: string) {
  if (!el) return;
  const url = await toPng(el, {
    backgroundColor: "#0b0c0e",
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
    filter: (n) => !(n instanceof HTMLElement && n.dataset.noexport !== undefined),
  });
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, "")}.png`;
  a.click();
}
