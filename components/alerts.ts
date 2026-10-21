"use client";
// 提醒規則、觸發紀錄（存在這台裝置）
import { useSyncExternalStore } from "react";
import { localStore } from "./hooks";
import type { Rule, Fired } from "@/lib/alertRules";

export const ruleStore = localStore<Rule[]>("namba.alerts", () => []);
export const firedStore = localStore<Fired[]>("namba.alerts.fired", () => []);
export const seenStore = localStore<string[]>("namba.alerts.seen", () => []);
const NO_RULES: Rule[] = [];
const NO_FIRED: Fired[] = [];

export function useRules() {
  const rules = useSyncExternalStore(ruleStore.subscribe, ruleStore.read, () => NO_RULES);
  return {
    rules,
    add: (r: Omit<Rule, "id" | "created" | "on">) => {
      ruleStore.write([...ruleStore.read(), { ...r, id: crypto.randomUUID().slice(0, 8), created: Date.now(), on: true }]);
      askPermission();
    },
    toggle: (id: string) => ruleStore.write(ruleStore.read().map((r) => (r.id === id ? { ...r, on: !r.on } : r))),
    remove: (id: string) => ruleStore.write(ruleStore.read().filter((r) => r.id !== id)),
    update: (id: string, patch: Partial<Rule>) => ruleStore.write(ruleStore.read().map((r) => (r.id === id ? { ...r, ...patch } : r))),
  };
}

export function useFired() {
  return useSyncExternalStore(firedStore.subscribe, firedStore.read, () => NO_FIRED);
}

export function askPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
}
