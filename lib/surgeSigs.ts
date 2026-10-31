// 飆股訊號的定義與型別（前後端共用，不讀檔案；計算在 lib/surge.ts）
export type SigId = "rocket" | "brk60" | "squeeze" | "dry" | "gap" | "limup" | "bull" | "inst2" | "tBuy" | "clean" | "bigUp" | "conc";
export const SIGS: { id: SigId; label: string; tip: string; data: "價量" | "法人" | "融資" | "集保" | "分點" }[] = [
  { id: "rocket", label: "起漲訊號", tip: "漲 5% 以上、量是近 5 日均量 2 倍以上、站上 20 日線", data: "價量" },
  { id: "brk60", label: "帶量突破季高", tip: "收盤創 60 日新高，成交量是近 20 日均量 2 倍以上", data: "價量" },
  { id: "squeeze", label: "整理後突破", tip: "前 20 天高低差不到 12%（盤整），今天收盤突破這段最高價、量放大 1.5 倍", data: "價量" },
  { id: "dry", label: "量縮後放量", tip: "前 10 天均量不到前 60 天的六成（沒人理），今天漲 3% 以上、量是 20 日均量 2 倍", data: "價量" },
  { id: "gap", label: "跳空上漲", tip: "開盤比昨天最高價高 2% 以上、收紅K、漲 3% 以上", data: "價量" },
  { id: "limup", label: "第一根漲停", tip: "今天漲停（漲 9.5% 以上），昨天沒有漲停", data: "價量" },
  { id: "bull", label: "均線剛轉多頭", tip: "今天 5 日 > 20 日 > 60 日線，5 天前還不是", data: "價量" },
  { id: "inst2", label: "外資投信同買", tip: "今天外資、投信都買超，合計佔成交量 10% 以上", data: "法人" },
  { id: "tBuy", label: "投信開始買", tip: "投信近 3 天買超合計 ≥ 20 日均量的 3%，之前 10 天沒有淨買", data: "法人" },
  { id: "clean", label: "漲了融資反減", tip: "近 5 日漲 5% 以上，融資餘額反而減少 3% 以上（籌碼沒跑到散戶手上）", data: "融資" },
  { id: "bigUp", label: "千張大戶加碼", tip: "這週千張大戶持股增加 0.5 個百分點以上、股東人數減少", data: "集保" },
  { id: "conc", label: "主力集中買", tip: "近 5 天買賣超前 15 名分點淨買合計佔成交量 10% 以上", data: "分點" },
];
export const SIG = Object.fromEntries(SIGS.map((s) => [s.id, s])) as Record<SigId, (typeof SIGS)[number]>;

export type SigStat = { id: SigId; n: number; ex5: number; ex20: number; win20: number; hit: number; drop: number; w: number; from: string };
export type Bucket = { label: string; n: number; ex20: number; hit: number; drop: number };
export type Backtest = { from: string; to: string; mid: string; base: { hit: number; drop: number; n: number }; stats: SigStat[]; oos: Bucket[] };
export type Cand = { c: string; score: number; sigs: SigId[]; close: number; pct: number; d5: number; d20: number; vr: number; val: number; risk: string[] };

/** 飆股晚報一天的檔案（scripts/surge.ts 寫 data/surge/日期.json） */
export type SurgeItem = Cand & { n: string; ind: string; ai?: string; warn?: string };
export type SurgeDay = { date: string; generated: number; backfill?: boolean; model?: string; headline?: string; points?: string[]; watch?: string; bt: Backtest; items: SurgeItem[] };
