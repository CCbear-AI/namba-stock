// 前後端共用的資料形狀

/** 全市場快照中的一檔 */
export type Row = {
  c: string; n: string; m: "tse" | "otc"; ind: string;
  price: number; prev: number; pct: number; chg: number;
  open: number; high: number; low: number;
  vol: number; // 張
  value: number; // 成交值（億，估算）
  cap: number; // 市值（億）
  up: number; down: number;
  bid1: number; ask1: number; bv: number; av: number; // 最佳一檔買賣價與張數（判斷漲跌停鎖住）
};

export type IndexQuote = { c: string; n: string; price: number; prev: number; chg: number; pct: number; high: number; low: number; open: number };

export type Market = {
  time: number;
  open: boolean; // 是否盤中
  indices: IndexQuote[];
  stocks: Row[];
  breadth: { up: number; flat: number; down: number; limitUp: number; limitDown: number; value: number };
  /** true = 即時報價抓不到，暫時顯示最近一天收盤 */
  stale?: boolean;
};

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

export type Level = { kind: "support" | "resistance"; price: number; strength: 1 | 2 | 3; note: string; /** 區間型依據（缺口、成交密集區）的上下緣 */ zone?: [number, number] };
