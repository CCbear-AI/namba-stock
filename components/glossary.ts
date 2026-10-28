// 各頁共用的名詞說明（給 <Help>／<Term> 用），改這裡就全站一起改
export const RVOL_HELP = "RVOL（相對成交量）＝今天到這個時間的成交量 ÷ 過去 20 日「同一時段」的平均量（依大盤盤中量能曲線估算）；收盤後就是今日量 ÷ 20 日均量。1x 是平常水準，2x 以上代表比平常熱很多。";
export const VR_HELP = "量比＝今日成交量 ÷ 近 5 日平均成交量。不分時段，盤中還沒收盤時數字會偏低；要比盤中熱度請看 RVOL。";
const EFF = "推進效率＝今日漲跌幅 ÷ 近 20 日平均每日漲跌幅 ÷ RVOL，代表「花了多少量、換到多少漲跌」。";
export const PUSH_HELP = `爆量推進：同時段 RVOL ≥ 2、今天漲 ≥ 3%，而且推進效率 ≥ 1——量放出來，價格也真的被推上去。${EFF}`;
export const STALL_HELP = "爆量沒推進：同時段 RVOL ≥ 2，但今天漲跌幅不到近 20 日平均每日漲跌幅的三成——量很大、價格卻幾乎沒動，代表那個價位有大量買賣在互相吸收，常是卡關或換手的訊號。";
export const VPU_HELP = `量價齊揚：RVOL ≥ 1.5、推進效率 ≥ 1，而且今天上漲——放量的同時價格確實被推上去。${EFF}`;
export const SCREENER_HELP = "創新高＝收盤 ≥ 前 N 日最高收盤；創新低＝收盤 ≤ 前 N 日最低收盤；均線多頭排列＝5 日線 ＞ 20 日線 ＞ 60 日線。RVOL、量比、量價齊揚、爆量推進、爆量沒推進，滑鼠移到條件名稱上就有說明。";

/** 選股條件（lib/conditions 的 id）→ 說明 */
export const COND_HELP: Record<string, string> = {
  vr2: VR_HELP, vshrink: VR_HELP, rvol2: RVOL_HELP, rvol3: RVOL_HELP, vpu: VPU_HELP, push: PUSH_HELP, stall: STALL_HELP,
};

/** 強勢訊號標籤 → 說明（沒有的回傳 undefined） */
export function tagHelp(tag: string): string | undefined {
  if (tag === "爆量推進") return PUSH_HELP;
  if (tag === "爆量沒推進") return STALL_HELP;
  if (tag.startsWith("量增")) return `${tag}：今日成交量是近 5 日平均量的這個倍數（量比）。`;
  if (tag === "逼近漲停") return "股價離漲停價不到 1.5%。";
  if (tag === "漲停鎖住") return "成交在漲停價，而且賣方沒有掛單。";
  if (tag === "漲停打開") return "今天曾經碰到漲停價，但目前已經打開、成交在漲停價以下。";
  return undefined;
}
