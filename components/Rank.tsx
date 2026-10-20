"use client";
import Link from "next/link";
import type { Row } from "@/lib/types";
import { cls, pct, price } from "./fmt";

/** 排行小卡：代號 名稱 數值 */
export function RankCard({ title, rows, value, sub }: { title: string; rows: Row[]; value: (r: Row) => React.ReactNode; sub?: string }) {
  return (
    <div className="card flex flex-col min-h-0">
      <div className="card-h">{title}{sub && <span className="sub">{sub}</span>}</div>
      <div className="scroll-y max-h-[260px] px-2 pb-2">
        {rows.map((r) => (
          <Link key={r.c} href={`/stock/${r.c}`} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-panel-2">
            <span className="mono text-text-2 w-12">{r.c}</span>
            <span className="flex-1 truncate">{r.n}</span>
            <span className="mono">{value(r)}</span>
          </Link>
        ))}
        {!rows.length && <div className="sub px-2 py-6 text-center loading">載入中…</div>}
      </div>
    </div>
  );
}

export const pctCell = (r: Row) => <span className={cls(r.pct)}>{pct(r.pct)}</span>;
export const priceCell = (r: Row) => <span className={cls(r.chg)}>{price(r.price)}</span>;
