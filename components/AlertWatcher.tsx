"use client";
// 全站背景檢查提醒：網頁開著時每 30 秒比對一次，條件符合就跳瀏覽器通知並記到「觸發紀錄」
import { useEffect, useMemo, useRef } from "react";
import { useRules, firedStore, seenStore } from "./alerts";
import { useGroups } from "./hooks";
import { builtinCodes } from "./scopes";
import { pushOn, syncPush } from "./push";
import { evaluate, type Rule } from "@/lib/alertRules";
import type { ScanRow } from "@/lib/scan";

/** RVOL／爆量卡關的範圍是群組，檢查前換成最新的股票清單 */
export function resolveRules(rules: Rule[], groups: { id: string; codes: string[] }[], rows: ScanRow[]) {
  return rules.map((r) => (r.scope ? { ...r, codes: r.scope.startsWith("b-") ? builtinCodes(r.scope, rows) : groups.find((g) => g.id === r.scope)?.codes ?? r.codes ?? [] } : r));
}

export default function AlertWatcher() {
  const { rules } = useRules();
  const { groups } = useGroups();
  const active = rules.filter((r) => r.on);
  const last = useRef<ScanRow[]>([]);
  const sig = useMemo(() => JSON.stringify([rules, groups.map((g) => [g.id, g.codes])]), [rules, groups]);

  // 規則變了就同步給背景推播
  useEffect(() => { syncPush(resolveRules(rules, groups, last.current)); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active.length) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (document.visibilityState === "visible" || !pushOn()) {
        try {
          const j = await (await fetch("/api/scan", { cache: "no-store" })).json();
          if (!stop && j.rows) {
            last.current = j.rows;
            const day = new Date(j.time + 8 * 3600e3).toISOString().slice(0, 10);
            const seen = new Set(seenStore.read().filter((k) => k.includes(`|${day}`) || k.includes("@")));
            const fired = evaluate(resolveRules(active, groups, j.rows), j.rows, day, seen);
            seenStore.write([...seen].slice(-3000));
            if (fired.length) {
              firedStore.write([...fired.reverse(), ...firedStore.read()].slice(0, 200));
              // 開了背景推播就交給伺服器推，這裡不重複跳
              if (!pushOn() && typeof Notification !== "undefined" && Notification.permission === "granted") {
                for (const f of fired.slice(0, 5)) {
                  const n = new Notification("台股難波萬提醒", { body: f.msg, icon: "/logo.svg", tag: `${f.ruleId}${f.code ?? ""}` });
                  n.onclick = () => { window.focus(); location.href = f.link; };
                }
              }
            }
          }
        } catch { /* 下一輪再試 */ }
      }
      if (!stop) timer = setTimeout(run, 30_000);
    };
    run();
    return () => { stop = true; clearTimeout(timer); };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
