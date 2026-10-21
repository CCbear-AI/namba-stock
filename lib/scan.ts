// 全市場掃描：即時快照 + 歷史日 K + 籌碼 → 每檔的量比、RVOL、均線、新高新低、法人連買…
// 選股器、破頂雷達、漲幅排行、漲跌停、飆股訊號、提醒都用這份
import { getDaily, getChips, getAth, lastIdx, type Series } from "./history";
import { volFraction } from "./misStats";
import type { Market, Row } from "./types";

export type ScanRow = Row & {
  vr: number; // 量比 = 今日量 ÷ 近 5 日均量
  rvol: number; // 同時段相對成交量
  ma5: number; ma20: number; ma60: number;
  d5: number; d20: number; d60: number; // 近 N 日漲跌幅（對比 N 個交易日前收盤）
  hi20: number; hi60: number; hi120: number; // 前 N 日最高「收盤」（不含今天）
  lo20: number; lo60: number; lo120: number; // 前 N 日最低「收盤」（不含今天）
  move20: number; // 近 20 日平均每日漲跌幅（%，絕對值）
  ath: number; atl: number; // 上市以來最高／最低（到昨天）
  rng20: number; // 近 20 日平均日波幅（高−低，元）
  fDays: number; tDays: number; // 外資／投信連買天數（負數＝連賣）
  f1: number; t1: number; d1: number; // 最新一天法人買賣超（張）
  chipDate: string;
  limStreak: number; // 連續漲停天數（含今天）
  lockBid: number; // 漲停委買張數（漲停鎖住時的最佳買量）
  c20: number[]; // 近 20 日收盤（含今天），畫小走勢
};

const avg = (a: number[]) => { let s = 0, k = 0; for (const v of a) if (!Number.isNaN(v)) { s += v; k++; } return k ? s / k : NaN; };
const max = (a: number[]) => { let m = -Infinity; for (const v of a) if (!Number.isNaN(v) && v > m) m = v; return m === -Infinity ? NaN : m; };
const min = (a: number[]) => { let m = Infinity; for (const v of a) if (!Number.isNaN(v) && v < m) m = v; return m === Infinity ? NaN : m; };
const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

/** 取最後 n 個有交易的值（到 end 為止，含 end） */
function tail(a: number[], end: number, n: number) {
  const out: number[] = [];
  for (let i = end; i >= 0 && out.length < n; i--) if (!Number.isNaN(a[i])) out.push(a[i]);
  return out.reverse();
}

function streak(vals: number[]) {
  let s = 0;
  for (let i = vals.length - 1; i >= 0; i--) {
    const v = vals[i];
    if (!v) break;
    if (s === 0) s = v > 0 ? 1 : -1;
    else if ((v > 0) !== (s > 0)) break;
    else s += s > 0 ? 1 : -1;
  }
  return s;
}

let memo: { key: string; rows: ScanRow[] } | null = null;

export function scan(m: Market): ScanRow[] {
  const key = `${m.time}:${m.stocks.length}`;
  if (memo?.key === key) return memo.rows;
  const { dates, s } = getDaily();
  const chips = getChips();
  const ath = getAth().s;
  const today = new Date(m.time + 8 * 3600e3).toISOString().slice(0, 10);
  // 盤後已經有今天的日 K 檔時，歷史只算到前一天
  const end = dates.at(-1) === today ? dates.length - 2 : dates.length - 1;
  const tw = new Date(Date.now() + 8 * 3600e3);
  const minute = tw.getUTCHours() * 60 + tw.getUTCMinutes();
  const frac = m.open && dates.at(-1) !== today ? volFraction(minute) : 1;

  // 法人連買：從最新往回
  const lastChip = chips.at(-1);
  const rows = m.stocks.map((r): ScanRow => {
    const h: Series | undefined = s.get(r.c);
    const e = h ? lastIdx(h.c, end) : -1;
    const closes = h && e >= 0 ? tail(h.c, e, 119) : [];
    const vols = h && e >= 0 ? tail(h.v, e, 20) : [];
    const rngs = h && e >= 0 ? tail(h.h.map((x, i) => x - h.l[i]), e, 20) : [];
    const px = r.vol > 0 ? r.price : r.prev;
    const withToday = [...closes, px];
    const maN = (n: number) => (withToday.length >= n ? avg(withToday.slice(-n)) : NaN);
    const ago = (n: number) => (closes.length >= n ? closes[closes.length - n] : NaN);
    const v5 = avg(vols.slice(-5)), v20 = avg(vols);
    const fs = chips.map((d) => d.s[r.c]?.[0] ?? 0), ts = chips.map((d) => d.s[r.c]?.[1] ?? 0);
    const lc = lastChip?.s[r.c];
    // 連續漲停：今天鎖漲停才往回數
    let lim = 0;
    if (r.up && r.price >= r.up && r.vol > 0) {
      lim = 1;
      for (let i = closes.length - 1; i >= 1; i--) {
        if (closes[i] / closes[i - 1] - 1 >= 0.094) lim++; else break;
      }
    }
    const a = ath[r.c];
    return {
      ...r,
      vr: r2(v5 ? r.vol / v5 : 0),
      rvol: r2(v20 ? r.vol / (v20 * frac) : 0),
      ma5: r2(maN(5)), ma20: r2(maN(20)), ma60: r2(maN(60)),
      d5: r2((px / ago(5) - 1) * 100), d20: r2((px / ago(20) - 1) * 100), d60: r2((px / ago(60) - 1) * 100),
      hi20: r2(max(closes.slice(-20))), hi60: r2(max(closes.slice(-60))), hi120: r2(max(closes.slice(-120))),
      lo20: r2(min(closes.slice(-20))), lo60: r2(min(closes.slice(-60))), lo120: r2(min(closes.slice(-120))),
      move20: r2(avg(closes.slice(-21).map((c, i, a) => (i ? Math.abs(c / a[i - 1] - 1) * 100 : NaN)))),
      ath: a?.[0] ?? 0, atl: a?.[2] ?? 0,
      rng20: r2(avg(rngs)),
      fDays: streak(fs), tDays: streak(ts),
      f1: lc?.[0] ?? 0, t1: lc?.[1] ?? 0, d1: lc?.[2] ?? 0,
      chipDate: lastChip?.date ?? "",
      limStreak: lim,
      lockBid: r.up && r.price >= r.up ? r.bv : 0,
      c20: withToday.slice(-20).map(r2),
    };
  });
  memo = { key, rows };
  return rows;
}
