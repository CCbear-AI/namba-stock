"use client";
// 河道：每檔一條，從中線往右是漲、往左是跌，河道裡的光點往前流；可以匯出重播影片
import Link from "next/link";
import { useState } from "react";
import { cls, pct } from "./fmt";
import { industryGroup } from "@/lib/industries";

export type RiverRow = { c: string; n: string; ind: string; v: number; rankChg?: number };
export const GROUP_COLOR = { 電子: "#d4e157", 金融: "#5aa9ff", 傳產: "#b48cff" } as const;

export default function River({ rows }: { rows: RiverRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v)));
  return (
    <div>
      <div className="grid grid-cols-[160px_1fr_70px] text-[11px] mb-1"><span /><div className="flex justify-center gap-2"><span className="down">下跌</span><span className="up">上漲</span></div><span /></div>
      {rows.map((r) => {
        const w = (Math.abs(r.v) / max) * 50, up = r.v >= 0;
        return (
          <div key={r.c} className="grid grid-cols-[160px_1fr_70px] items-center h-[34px] rounded-lg hover:bg-panel-2 px-2">
            <Link href={`/stock/${r.c}`} className="flex items-center gap-2 min-w-0">
              <i className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GROUP_COLOR[industryGroup(r.ind)] }} />
              <span className="truncate">{r.n}</span>
              {r.rankChg ? <span className={`text-[11px] ${r.rankChg > 0 ? "up" : "down"}`}>{r.rankChg > 0 ? "▲" : "▼"}{Math.abs(r.rankChg)}</span> : null}
            </Link>
            <div className="relative h-3">
              <div className="absolute left-1/2 top-[-6px] bottom-[-6px] border-l border-dashed border-line" />
              <div className="absolute top-0 bottom-0 rounded-full overflow-hidden river" style={{ [up ? "left" : "right"]: "50%", width: `${w}%`, background: `linear-gradient(${up ? "90deg" : "270deg"}, ${up ? "#f0505a11, #f0505a88" : "#22b57311, #22b57388"})` }}>
                <span className="river-dots" style={{ animationDirection: up ? "normal" : "reverse" }} />
              </div>
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ [up ? "left" : "right"]: `calc(50% + ${w}% - 6px)`, background: up ? "var(--up)" : "var(--down)", boxShadow: `0 0 8px ${up ? "#f0505a" : "#22b573"}` }} />
            </div>
            <span className={`mono text-right ${cls(r.v)}`}>{pct(r.v)}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 把河道重播錄成影片：frames 是每個時間點各檔的漲跌幅
 * 回傳下載用的 Blob（瀏覽器支援 mp4 就用 mp4，否則 webm）
 */
export async function recordRiver(title: string, names: Map<string, { n: string; ind: string }>, frames: { t: string; v: Record<string, number> }[], onProgress: (p: number) => void, unit: "%" | "億" = "%") {
  const W = 1280, rowH = 34, top = 110;
  const codes = Object.keys(frames.at(-1)?.v ?? {});
  const H = Math.min(1440, top + codes.length * rowH + 40);
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  const mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(chunks, { type: mime.split(";")[0] }))));
  const max = Math.max(1, ...frames.flatMap((f) => Object.values(f.v).map(Math.abs)));
  const fps = 30, per = Math.max(2, Math.round((10 * fps) / Math.max(1, frames.length))); // 約 10 秒播完
  const total = frames.length * per + fps * 2;
  const pos = new Map<string, number>(); // 名次動畫
  rec.start();
  for (let k = 0; k < total; k++) {
    const fi = Math.min(frames.length - 1, Math.floor(k / per)), next = Math.min(frames.length - 1, fi + 1), a = (k % per) / per;
    const f = frames[fi], g = frames[next];
    const val = (c: string) => (f.v[c] ?? 0) + ((g.v[c] ?? 0) - (f.v[c] ?? 0)) * (k < frames.length * per ? a : 0);
    const order = [...codes].sort((x, y) => val(y) - val(x));
    ctx.fillStyle = "#0b0c0e"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#e8e6e1"; ctx.font = "bold 30px 'Noto Sans TC', sans-serif"; ctx.fillText(title, 40, 52);
    ctx.fillStyle = "#d9b45a"; ctx.font = "26px monospace"; ctx.fillText(f.t, W - 160, 52);
    ctx.fillStyle = "#646a73"; ctx.font = "14px sans-serif"; ctx.fillText("台股難波萬 · 河道重播", 40, 82);
    const mid = 260 + (W - 260 - 120) / 2, half = (W - 260 - 120) / 2;
    ctx.strokeStyle = "#262a31"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(mid, top - 10); ctx.lineTo(mid, H - 20); ctx.stroke(); ctx.setLineDash([]);
    order.forEach((c, i) => {
      const target = top + i * rowH;
      const y = (pos.get(c) ?? target) + (target - (pos.get(c) ?? target)) * 0.2;
      pos.set(c, y);
      const v = val(c), w = (Math.abs(v) / max) * half, up = v >= 0, col = up ? "#f0505a" : "#22b573";
      const meta = names.get(c);
      ctx.fillStyle = GROUP_COLOR[industryGroup(meta?.ind ?? "")]; ctx.beginPath(); ctx.arc(50, y + 12, 4, 0, 7); ctx.fill();
      ctx.fillStyle = "#e8e6e1"; ctx.font = "17px 'Noto Sans TC', sans-serif"; ctx.fillText(meta?.n ?? c, 64, y + 18);
      const gr = ctx.createLinearGradient(mid, 0, up ? mid + w : mid - w, 0); gr.addColorStop(0, col + "11"); gr.addColorStop(1, col + "aa");
      ctx.fillStyle = gr; ctx.fillRect(up ? mid : mid - w, y + 6, w, 12);
      for (let d = 0; d < w; d += 22) { const x = up ? mid + ((d + k * 2) % Math.max(1, w)) : mid - ((d + k * 2) % Math.max(1, w)); ctx.fillStyle = "#ffffffaa"; ctx.fillRect(x, y + 11, 2, 2); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(up ? mid + w : mid - w, y + 12, 6, 0, 7); ctx.fill();
      ctx.font = "16px monospace"; ctx.textAlign = "right"; ctx.fillText(`${v > 0 ? "+" : ""}${v.toFixed(2)}${unit === "%" ? "%" : " 億"}`, W - 30, y + 18); ctx.textAlign = "left";
    });
    onProgress(k / total);
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
  rec.stop();
  onProgress(1);
  return done;
}

/** 名次變化：跟上一次的排序比，往上幾名是正數 */
export function useRankChange(order: string[]) {
  const key = order.join();
  const [snap, setSnap] = useState<{ key: string; prev: Map<string, number>; cur: Map<string, number> }>({ key: "", prev: new Map(), cur: new Map() });
  if (snap.key !== key) setSnap({ key, prev: snap.cur, cur: new Map(order.map((c, i) => [c, i])) });
  const out = new Map<string, number>();
  order.forEach((c, i) => { const p = snap.prev.get(c); if (p != null && p !== i) out.set(c, p - i); });
  return out;
}
