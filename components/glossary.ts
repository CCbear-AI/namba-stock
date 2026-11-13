// 各頁共用的名詞說明（給 <Help>／<Term> 用），改這裡就全站一起改
export const RVOL_HELP = "RVOL（相對成交量）＝今天到這個時間的成交量 ÷ 過去 20 日「同一時段」的平均量（依大盤盤中量能曲線估算）；收盤後就是今日量 ÷ 20 日均量。1x 是平常水準，2x 以上代表比平常熱很多。";
export const VR_HELP = "量比＝今日成交量 ÷ 近 5 日平均成交量。不分時段，盤中還沒收盤時數字會偏低；要比盤中熱度請看 RVOL。";
const EFF = "推進效率＝今日漲跌幅 ÷ 近 20 日平均每日漲跌幅 ÷ RVOL，代表「花了多少量、換到多少漲跌」。";
export const PUSH_HELP = `爆量推進：同時段 RVOL ≥ 2、今天漲 ≥ 3%，而且推進效率 ≥ 1——量放出來，價格也真的被推上去。${EFF}`;
export const STALL_HELP = "爆量沒推進：同時段 RVOL ≥ 2，但今天漲跌幅不到近 20 日平均每日漲跌幅的三成——量很大、價格卻幾乎沒動，代表那個價位有大量買賣在互相吸收，常是卡關或換手的訊號。";
export const VPU_HELP = `量價齊揚：RVOL ≥ 1.5、推進效率 ≥ 1，而且今天上漲——放量的同時價格確實被推上去。${EFF}`;
export const SCREENER_HELP = "創新高＝收盤 ≥ 前 N 日最高收盤；創新低＝收盤 ≤ 前 N 日最低收盤；均線多頭排列＝5 日線 ＞ 20 日線 ＞ 60 日線。RVOL、量比、量價齊揚、爆量推進、爆量沒推進，滑鼠移到條件名稱上就有說明。";

/** 選股條件（lib/conditions 的 id）→ 說明 */
const UT_HELP = "跟個股 K 線「熱門腳本 → UT Bot 買賣訊號」同一套算法（日K、敏感度 1、ATR 10）：今天收盤（盤中用現價）由下往上穿過 ATR 移動停損線＝買訊，往下穿＝賣訊。盤中價格還在動，訊號可能收盤前消失，以收盤為準。";
const VCP_BASE = "VCP 波動收縮（Minervini）：①強勢趨勢：收盤站上 50／150／200 日線、50 > 150 > 200、200 日線比 20 天前高、比 52 週低點高 30% 以上、離 52 週高點 25% 以內 ②回檔一次比一次淺：前 75 天切三段（每段 25 天），(最高−最低)÷最高 第一段 ≥ 10%、逐段變淺、最後一段 ≤ 10% ③量縮：10 日均量 < 50 日均量 × 0.7 ④250 日漲幅贏過加權指數。樞紐點＝最後一段最高價。三段等長是近似算法，突破也可能失敗，記得設停損。";
const VCP_BRK = `VCP 突破：符合下列條件，而且今天收盤由下往上突破樞紐點、量 > 50 日均量 1.5 倍、≥ 500 張。盤中價格還在動，以收盤為準。${VCP_BASE}`;
const VCP_SET = `VCP 整理中：還沒突破、收盤仍在樞紐點以下的候選股（50 日均量 ≥ 500 張），可以先加自選等突破。${VCP_BASE}`;
export const COND_HELP: Record<string, string> = {
  vr2: VR_HELP, vshrink: VR_HELP, rvol2: RVOL_HELP, rvol3: RVOL_HELP, vpu: VPU_HELP, push: PUSH_HELP, stall: STALL_HELP, utbuy: UT_HELP, utsell: UT_HELP, vcpbrk: VCP_BRK, vcpset: VCP_SET,
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
