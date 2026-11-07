"use client";
// 定時抓資料的節奏（省 Vercel CPU／流量）：
// - 分頁不在前景（切到別的分頁、縮小、手機鎖螢幕）就不抓，回來時馬上補抓一次
// - 盤中（週一到五 8:30–13:45）照原本間隔；其他時間資料幾乎不會變，最快 10 分鐘抓一次

/** 台灣時間是否在盤中前後（含開盤前試撮、收盤後 10 分鐘） */
export function isLiveHours(now = Date.now()) {
  const d = new Date(now + 8 * 3600e3);
  const wd = d.getUTCDay();
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return wd >= 1 && wd <= 5 && m >= 8 * 60 + 30 && m <= 13 * 60 + 45;
}

export const OFF_HOURS_MS = 10 * 60_000;

/** 下一次要等多久 */
export const paceOf = (interval: number) => (isLiveHours() ? interval : Math.max(interval, OFF_HOURS_MS));

export const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

/**
 * 依節奏重複執行 run：看不到就暫停，回到前景時若已經超過間隔就馬上跑。
 * 回傳停止函式。
 */
export function startPolling(run: () => Promise<void> | void, interval: number, opts: { whenHidden?: () => boolean } = {}) {
  let stop = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = 0;
  let busy = false;
  const allowed = () => visible() || (opts.whenHidden?.() ?? false);
  const tick = async () => {
    if (stop || busy) return; // 正在跑的那輪結束後自己會排下一次
    clearTimeout(timer);
    if (allowed()) {
      busy = true;
      last = Date.now();
      try { await run(); } catch { /* 下一輪再試 */ }
      busy = false;
    }
    if (!stop) timer = setTimeout(tick, paceOf(interval));
  };
  const onVis = () => { if (visible() && Date.now() - last >= paceOf(interval)) tick(); };
  document.addEventListener("visibilitychange", onVis);
  tick();
  return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
}
