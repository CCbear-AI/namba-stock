// AI 策略規格的型別與中文說明（前後端共用，不能 import 讀檔的模組）
import { BY_CODE } from "@/lib/universe";
import { ETFS } from "@/lib/etfs";

export type Cond =
  | { k: "aboveMA" | "belowMA" | "crossMA"; n: number }
  | { k: "maBull" }
  | { k: "newHigh" | "newLow"; n: number }
  | { k: "chg"; n: number; min?: number; max?: number }
  | { k: "volRatio"; n: number; min: number }
  | { k: "price"; min?: number; max?: number }
  | { k: "value"; min: number }
  | { k: "rsi"; n: number; min?: number; max?: number }
  | { k: "foreignBuy" | "trustBuy" | "foreignSell" | "trustSell"; days: number };
export type Exit =
  | { k: "stopLoss" | "takeProfit" | "trailing"; pct: number }
  | { k: "belowMA"; n: number }
  | { k: "maxDays"; n: number };
export type Universe = { k: "all" | "tse" | "otc" | "tw50" | "watchlist" | "codes" | "industry" | "theme"; codes?: string[]; name?: string; minValue?: number };
export type Spec = {
  name: string; idea: string;
  universe: Universe; entry: Cond[]; exit: Exit[];
  hold: { max: number }; rank: "value" | "chg" | "volRatio";
  assume?: string[]; unsupported?: string[];
};

// ---------- 給畫面用的中文說明 ----------
export const maName = (n: number) => ({ 5: "週線", 10: "雙週線", 20: "月線", 60: "季線", 120: "半年線", 240: "年線" } as Record<number, string>)[n] ?? `${n} 日均線`;
const range = (min?: number, max?: number, u = "") => (min != null && max != null ? `${min}${u} ~ ${max}${u}` : min != null ? `≥ ${min}${u}` : max != null ? `≤ ${max}${u}` : "不限");
export function condText(c: Cond): string {
  switch (c.k) {
    case "aboveMA": return `收盤站上${maName(c.n)}`;
    case "belowMA": return `收盤在${maName(c.n)}之下`;
    case "crossMA": return `收盤由下往上突破${maName(c.n)}`;
    case "maBull": return "均線多頭排列（5 > 20 > 60 日）";
    case "newHigh": return `收盤創 ${c.n} 日新高`;
    case "newLow": return `收盤創 ${c.n} 日新低`;
    case "chg": return `${c.n === 1 ? "當日" : `近 ${c.n} 日`}漲跌幅 ${range(c.min, c.max, "%")}`;
    case "volRatio": return `成交量是前 ${c.n} 日均量的 ${c.min} 倍以上`;
    case "price": return `股價 ${range(c.min, c.max, " 元")}`;
    case "value": return `成交值 ≥ ${c.min} 億`;
    case "rsi": return `RSI(${c.n}) ${range(c.min, c.max)}`;
    case "foreignBuy": return `外資連買 ${c.days} 天以上`;
    case "trustBuy": return `投信連買 ${c.days} 天以上`;
    case "foreignSell": return `外資連賣 ${c.days} 天以上`;
    case "trustSell": return `投信連賣 ${c.days} 天以上`;
  }
}
export function exitText(e: Exit): string {
  switch (e.k) {
    case "stopLoss": return `虧 ${e.pct}% 停損`;
    case "takeProfit": return `賺 ${e.pct}% 停利`;
    case "trailing": return `從持有期間最高價回落 ${e.pct}% 出場`;
    case "belowMA": return `收盤跌破${maName(e.n)}，隔天開盤賣`;
    case "maxDays": return `最多抱 ${e.n} 個交易日`;
  }
}
export function universeText(u: Universe, wlCount = 0): string {
  const base = { all: "全市場上市櫃股票", tse: "上市股票", otc: "上櫃股票", tw50: "上市市值前 50 大（≈0050 成分股）", watchlist: `我的自選股（${wlCount} 檔）`, codes: `指定 ${u.codes?.length ?? 0} 檔：${(u.codes ?? []).slice(0, 8).map((c) => BY_CODE.get(c)?.n ?? ETFS[c] ?? c).join("、")}${(u.codes?.length ?? 0) > 8 ? "…" : ""}`, industry: `${u.name}類股`, theme: `${u.name}族群` }[u.k];
  return u.minValue ? `${base}，排除成交值低於 ${u.minValue} 億的冷門股` : base;
}


/** 流程圖標籤用的短說明 */
export function condChip(c: Cond): string {
  switch (c.k) {
    case "aboveMA": return `站上${maName(c.n)}`;
    case "belowMA": return `在${maName(c.n)}下`;
    case "crossMA": return `突破${maName(c.n)}`;
    case "maBull": return "均線多頭";
    case "newHigh": return `創 ${c.n} 日新高`;
    case "newLow": return `創 ${c.n} 日新低`;
    case "chg": return `${c.n === 1 ? "當日" : `${c.n} 日`}${range(c.min, c.max, "%")}`;
    case "volRatio": return `量比 ≥ ${c.min} 倍`;
    case "price": return `股價 ${range(c.min, c.max, " 元")}`;
    case "value": return `成交值 ≥ ${c.min} 億`;
    case "rsi": return `RSI ${range(c.min, c.max)}`;
    case "foreignBuy": return `外資連買 ${c.days} 天`;
    case "trustBuy": return `投信連買 ${c.days} 天`;
    case "foreignSell": return `外資連賣 ${c.days} 天`;
    case "trustSell": return `投信連賣 ${c.days} 天`;
  }
}
export function exitChip(e: Exit): string {
  switch (e.k) {
    case "stopLoss": return `虧 ${e.pct}% 停損`;
    case "takeProfit": return `賺 ${e.pct}% 停利`;
    case "trailing": return `高點回落 ${e.pct}%`;
    case "belowMA": return `跌破${maName(e.n)}`;
    case "maxDays": return `最多抱 ${e.n} 天`;
  }
}
export const rankText = (r: Spec["rank"]) => (r === "chg" ? "當天漲最多" : r === "volRatio" ? "量放最大" : "成交值最大");

/** AI 沒給說明時，用規格自己組一段白話 */
export function specReply(s: Spec, wlCount = 0): string {
  const t = `這版做法：從${universeText(s.universe, wlCount)}裡，每天收盤後挑出「${s.entry.map(condText).join("、")}」的股票，隔天開盤等權重買進，最多同時持有 ${s.hold.max} 檔；${s.exit.map(exitText).join("，或")}就出場。`;
  return [t, s.assume?.length ? `我自己補的假設：${s.assume.join("；")}。` : "", s.unsupported?.length ? `「${s.unsupported.join("、")}」這裡沒有資料，先略過。` : ""].filter(Boolean).join("");
}
