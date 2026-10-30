// 提醒規則與判斷（網頁端檢查與伺服器背景推播共用）
import type { ScanRow } from "./scan";
import { matchAll, STRATEGIES, COND, isLimitUp, isLimitDown, volStall } from "./conditions";

export type Rule = {
  id: string;
  kind: "price" | "pct" | "limit" | "insti" | "strategy" | "rvol" | "stall" | "report" | "wlreport";
  code?: string; name?: string;
  dir?: "above" | "below" | "up" | "down";
  value?: number;
  who?: "f" | "t";
  conds?: string[]; label?: string; // 選股策略
  codes?: string[]; scope?: string; // RVOL／爆量卡關的範圍（自選群組）
  on: boolean;
  created: number;
};
export type Fired = { t: number; ruleId: string; code?: string; msg: string; link: string };

export const KIND_LABEL: Record<Rule["kind"], string> = { price: "到價", pct: "漲跌幅", limit: "漲跌停", insti: "法人買超", strategy: "選股策略", rvol: "RVOL 突破", stall: "爆量卡關", report: "分點晚報", wlreport: "自選收盤報告" };

export function describe(r: Rule) {
  const n = r.name ?? r.code ?? "";
  switch (r.kind) {
    case "price": return `${n} 成交價${r.dir === "below" ? "低於" : "高於"} ${r.value}`;
    case "pct": return `${n} ${r.dir === "down" ? "跌幅" : "漲幅"}超過 ${r.value}%`;
    case "limit": return `${n} 漲停或跌停`;
    case "insti": return `${n} ${r.who === "t" ? "投信" : "外資"}單日買超 ≥ ${r.value?.toLocaleString()} 張`;
    case "strategy": return `選股策略「${r.label ?? (r.conds ?? []).map((c) => COND[c]?.label).join("＋")}」有新符合的股票`;
    case "rvol": return `自選股任一檔同時段 RVOL 當天第一次到 ${r.value} 倍`;
    case "stall": return "自選股出現爆量卡關（RVOL ≥ 2 倍，漲跌不到平常日波幅的三成）";
    case "report": return "每個交易日晚上分點晚報寫好";
    case "wlreport": return "每個交易日晚上自選群組的收盤報告整理好";
  }
}

/** 已觸發紀錄的 key：同一條規則同一檔同一天只響一次 */
export const firedKey = (ruleId: string, code: string | undefined, day: string) => `${ruleId}|${code ?? ""}|${day}`;

/**
 * 檢查一輪：回傳這次新觸發的提醒
 * seen：已觸發過的 key（呼叫端負責保存）
 */
export function evaluate(rules: Rule[], rows: ScanRow[], day: string, seen: Set<string>): Fired[] {
  const by = new Map(rows.map((r) => [r.c, r]));
  const out: Fired[] = [];
  const fire = (rule: Rule, code: string | undefined, msg: string, link: string) => {
    const k = firedKey(rule.id, code, day);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ t: Date.now(), ruleId: rule.id, code, msg, link });
  };
  const pctS = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
  for (const rule of rules) {
    if (!rule.on) continue;
    const r = rule.code ? by.get(rule.code) : undefined;
    switch (rule.kind) {
      case "price":
        if (r && r.vol > 0 && rule.value != null && (rule.dir === "below" ? r.price <= rule.value : r.price >= rule.value))
          fire(rule, r.c, `${r.n} 成交價 ${r.price}，已${rule.dir === "below" ? "跌破" : "突破"} ${rule.value}`, `/stock/${r.c}`);
        break;
      case "pct":
        if (r && r.vol > 0 && rule.value != null && (rule.dir === "down" ? r.pct <= -rule.value : r.pct >= rule.value))
          fire(rule, r.c, `${r.n} ${pctS(r.pct)}，${rule.dir === "down" ? "跌" : "漲"}幅超過 ${rule.value}%`, `/stock/${r.c}`);
        break;
      case "limit":
        if (r && isLimitUp(r)) fire(rule, r.c, `${r.n} 漲停 ${r.price}`, `/stock/${r.c}`);
        else if (r && isLimitDown(r)) fire(rule, r.c, `${r.n} 跌停 ${r.price}`, `/stock/${r.c}`);
        break;
      case "insti": {
        const lots = r ? (rule.who === "t" ? r.t1 : r.f1) : 0;
        if (r && rule.value != null && lots >= rule.value)
          fire({ ...rule, id: `${rule.id}@${r.chipDate}` }, r.c, `${r.n} ${r.chipDate.slice(5).replace("-", "/")} ${rule.who === "t" ? "投信" : "外資"}買超 ${lots.toLocaleString()} 張`, `/stock/${r.c}`);
        break;
      }
      case "strategy": {
        const conds = rule.conds ?? [];
        const hits = rows.filter((x) => matchAll(x, conds));
        const fresh = hits.filter((x) => !seen.has(firedKey(rule.id, x.c, day)));
        if (fresh.length) {
          for (const x of fresh) seen.add(firedKey(rule.id, x.c, day));
          const name = rule.label ?? STRATEGIES.find((s) => s.conds.join() === conds.join())?.label ?? "自訂條件";
          out.push({ t: Date.now(), ruleId: rule.id, msg: `「${name}」新符合 ${fresh.length} 檔：${fresh.slice(0, 5).map((x) => x.n).join("、")}${fresh.length > 5 ? "…" : ""}`, link: `/screener?c=${conds.join(",")}` });
        }
        break;
      }
      case "rvol":
        for (const c of rule.codes ?? []) {
          const x = by.get(c);
          if (x && rule.value != null && x.rvol >= rule.value) fire(rule, c, `${x.n} 同時段 RVOL ${x.rvol.toFixed(1)} 倍（${pctS(x.pct)}）`, `/stock/${c}`);
        }
        break;
      case "stall":
        for (const c of rule.codes ?? []) {
          const x = by.get(c);
          if (x && volStall(x)) fire(rule, c, `${x.n} 爆量卡關：RVOL ${x.rvol.toFixed(1)} 倍，${pctS(x.pct)}`, `/stock/${c}`);
        }
        break;
    }
  }
  return out;
}
