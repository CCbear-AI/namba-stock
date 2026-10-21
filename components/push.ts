"use client";
// 背景推播：註冊 Service Worker、訂閱推播，把提醒規則同步到伺服器（網頁關掉也會由盤中記錄器檢查並推送）
import { useSyncExternalStore } from "react";
import { VAPID_PUBLIC } from "@/lib/pushKey";
import type { Rule } from "@/lib/alertRules";

const DEV_KEY = "namba.device", ON_KEY = "namba.push";

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const pushOn = () => { try { return localStorage.getItem(ON_KEY) === "on"; } catch { return false; } };
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
/** 背景推播開關（給 React 訂閱） */
export function usePushOn() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, pushOn, () => false);
}

function device() {
  let d = localStorage.getItem(DEV_KEY);
  if (!d) { d = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, ""); localStorage.setItem(DEV_KEY, d); }
  return d;
}
function key(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function subscription() {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(VAPID_PUBLIC) });
}

export async function enablePush(rules: Rule[]) {
  if (!pushSupported()) throw new Error("這個瀏覽器不支援背景推播（iPhone 要先「加入主畫面」再從主畫面打開）");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("通知權限被拒絕，請到瀏覽器網站設定裡允許通知");
  const sub = await subscription();
  const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: device(), sub, rules }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "伺服器存不進去");
  localStorage.setItem(ON_KEY, "on");
  changed();
}

export async function syncPush(rules: Rule[]) {
  if (!pushOn() || !pushSupported()) return;
  try {
    const sub = await subscription();
    await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: device(), sub, rules }) });
  } catch { /* 下次再同步 */ }
}

export async function disablePush() {
  localStorage.removeItem(ON_KEY);
  changed();
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch { /* */ }
  await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: device() }) }).catch(() => {});
}
