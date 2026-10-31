"use client";
// 漲跌幅分布長條圖（跌停 … 漲停）
import type { ScanRow } from "@/lib/scan";
import { isLimitUp, isLimitDown } from "@/lib/conditions";

export const BUCKETS: { l: string; test: (r: ScanRow) => boolean; c: string }[] = [
  { l: "跌停", test: isLimitDown, c: "var(--down)" },
  { l: "≤-7", test: (r) => r.pct <= -7, c: "var(--down)" },
  { l: "-7~-5", test: (r) => r.pct > -7 && r.pct <= -5, c: "var(--down)" },
  { l: "-5~-3", test: (r) => r.pct > -5 && r.pct <= -3, c: "var(--down)" },
  { l: "-3~-1", test: (r) => r.pct > -3 && r.pct <= -1, c: "var(--down)" },
  { l: "-1~0", test: (r) => r.pct > -1 && r.pct < 0, c: "var(--down)" },
  { l: "平盤", test: (r) => r.pct === 0, c: "#9aa0a8" },
  { l: "0~1", test: (r) => r.pct > 0 && r.pct < 1, c: "var(--up)" },
  { l: "1~3", test: (r) => r.pct >= 1 && r.pct < 3, c: "var(--up)" },
  { l: "3~5", test: (r) => r.pct >= 3 && r.pct < 5, c: "var(--up)" },
  { l: "5~7", test: (r) => r.pct >= 5 && r.pct < 7, c: "var(--up)" },
  { l: "≥7", test: (r) => r.pct >= 7, c: "var(--up)" },
  { l: "漲停", test: isLimitUp, c: "var(--up)" },
];

export function bucketCounts(rows: ScanRow[]) {
  const live = rows.filter((r) => r.vol > 0);
  return BUCKETS.map((b, i) => {
    // 漲跌停另外算，不重複算進 ≥7 / ≤-7
    if (i === 1) return live.filter((r) => b.test(r) && !isLimitDown(r)).length;
    if (i === 11) return live.filter((r) => b.test(r) && !isLimitUp(r)).length;
    return live.filter(b.test).length;
  });
}

export default function Distribution({ rows, height = 200 }: { rows: ScanRow[]; height?: number }) {
  const n = bucketCounts(rows);
  const max = Math.max(1, ...n);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {BUCKETS.map((b, i) => (
        <div key={b.l} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <span className="mono text-[11px]" style={{ color: b.c }}>{n[i]}</span>
          <div className="w-full rounded-t" style={{ height: `${(n[i] / max) * 80}%`, minHeight: 3, background: b.c, opacity: i === 6 ? 0.6 : 1 }} />
          <span className="text-[11px] text-text-2 mt-1 whitespace-nowrap">{b.l}</span>
        </div>
      ))}
    </div>
  );
}
