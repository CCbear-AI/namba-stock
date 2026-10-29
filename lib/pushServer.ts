// 伺服器端背景推播（GitHub Actions 的記錄器呼叫）：讀 Supabase 的訂閱與規則 → 判斷 → 送 Web Push
import webpush from "web-push";
import { evaluate, type Rule, type Fired } from "./alertRules";
import { VAPID_PUBLIC } from "./pushKey";
import type { ScanRow } from "./scan";

type Sub = { device: string; sub: webpush.PushSubscription; rules: Rule[] };
const URL_ = process.env.SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_KEY?.trim();
const PRIV = process.env.VAPID_PRIVATE_KEY?.trim();
export const pushReady = Boolean(URL_ && KEY && PRIV);
if (PRIV) webpush.setVapidDetails("mailto:namba-stock@users.noreply.github.com", VAPID_PUBLIC, PRIV);

async function sb(path: string, init?: RequestInit) {
  return fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
}

let subs: { at: number; list: Sub[] } = { at: 0, list: [] };
async function loadSubs() {
  if (Date.now() - subs.at < 60_000) return subs.list;
  try {
    const r = await sb("push_subs?select=device,sub,rules");
    if (r.ok) subs = { at: Date.now(), list: await r.json() };
  } catch { /* 用上次的 */ }
  return subs.list;
}

const seen = new Map<string, Set<string>>(); // 每台裝置已推過的（這個程序跑一天，記在記憶體就好）

/** 不用判斷條件的通知（例如分點晚報）：推給有開這類提醒的每台裝置 */
export async function pushKind(kind: Rule["kind"], msg: { title: string; body: string; url: string; tag: string }) {
  if (!pushReady) return 0;
  let sent = 0;
  for (const s of await loadSubs()) {
    if (!(s.rules ?? []).some((r) => r.on && r.kind === kind)) continue;
    try {
      await webpush.sendNotification(s.sub, JSON.stringify(msg), { TTL: 12 * 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await sb(`push_subs?device=eq.${encodeURIComponent(s.device)}`, { method: "DELETE" }); subs.at = 0; continue; }
      console.error("推播失敗", code, (e as Error).message);
    }
  }
  return sent;
}

/** kinds：這次要檢查哪些類型（盤中不檢查法人買超，盤後只檢查法人買超） */
export async function checkAndPush(rows: ScanRow[], day: string, kinds: (k: Rule["kind"]) => boolean) {
  if (!pushReady) return 0;
  let sent = 0;
  for (const s of await loadSubs()) {
    const rules = (s.rules ?? []).filter((r) => r.on && kinds(r.kind));
    if (!rules.length) continue;
    const mine = seen.get(s.device) ?? new Set<string>();
    seen.set(s.device, mine);
    const fired: Fired[] = evaluate(rules, rows, day, mine);
    for (const f of fired.slice(0, 5)) {
      try {
        await webpush.sendNotification(s.sub, JSON.stringify({ title: "台股難波萬提醒", body: f.msg, url: f.link, tag: `${f.ruleId}${f.code ?? ""}` }), { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 訂閱失效（使用者關掉通知或換瀏覽器）就刪掉
        if (code === 404 || code === 410) { await sb(`push_subs?device=eq.${encodeURIComponent(s.device)}`, { method: "DELETE" }); subs.at = 0; break; }
        console.error("推播失敗", code, (e as Error).message);
      }
    }
  }
  return sent;
}
