"use client";
// 整站密碼登入頁：深色底＋金色 K 線背景，只有一格密碼
import { useState } from "react";

// 背景 K 線：固定的亂數種子，每次畫出來都一樣
const BARS = (() => {
  let s = 7, p = 60;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 64 }, (_, i) => {
    const o = p, c = Math.max(12, Math.min(108, o + (rnd() - 0.46) * 9));
    const h = Math.max(o, c) + rnd() * 4, l = Math.min(o, c) - rnd() * 4;
    p = c;
    return { x: i * 15 + 6, o, c, h, l };
  });
})();

export default function Login() {
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pwd.trim() || busy) return;
    setBusy(true);
    setErr("");
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pwd }) }).catch(() => null);
    if (r?.ok) {
      // 只跳回本站的頁面，避免被做成「登入後導去別的網站」的連結
      const next = new URL(new URLSearchParams(location.search).get("next") || "/", location.origin);
      location.replace(next.origin === location.origin ? next.pathname + next.search : "/");
      return;
    }
    setBusy(false);
    const msg = r && ((await r.json().catch(() => null)) as { error?: string } | null)?.error;
    setErr(r ? (r.status === 429 && msg ? msg : "密碼不對，再試一次") : "連不上伺服器，請稍後再試");
    setShake((n) => n + 1);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[var(--bg)] flex items-center justify-center px-5">
      {/* 背景：金色光暈＋淡淡的 K 線 */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(60% 50% at 50% 38%, rgba(217,180,90,.13), transparent 70%), radial-gradient(40% 35% at 85% 90%, rgba(217,180,90,.06), transparent 70%)" }} />
      <svg className="absolute inset-x-0 bottom-0 w-full h-[55%] opacity-[0.16] pointer-events-none" viewBox="0 0 966 120" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".35" stopColor="#fff" stopOpacity="1" /></linearGradient>
          <mask id="m"><rect width="966" height="120" fill="url(#fade)" /></mask>
        </defs>
        <g mask="url(#m)">
          {BARS.map((b) => {
            const up = b.c >= b.o, col = up ? "#f0d08a" : "#8a7a55";
            return (
              <g key={b.x}>
                <line x1={b.x + 4} x2={b.x + 4} y1={120 - b.h} y2={120 - b.l} stroke={col} strokeWidth="1" />
                <rect x={b.x} y={120 - Math.max(b.o, b.c)} width="8" height={Math.max(1.2, Math.abs(b.c - b.o))} fill={up ? col : "none"} stroke={col} strokeWidth="1" />
              </g>
            );
          })}
        </g>
      </svg>

      <form key={shake} onSubmit={submit} className={`relative w-full max-w-[380px] ${shake ? "login-shake" : ""}`}>
        <div className="flex flex-col items-center text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={56} height={56} className="mb-4 drop-shadow-[0_6px_24px_rgba(217,180,90,.35)]" />
          <h1 className="text-[28px] font-bold tracking-[0.2em] pl-[0.2em]" style={{ fontFamily: "'Noto Serif TC', serif", background: "linear-gradient(180deg, #f6e2ad, #c99a3c)", WebkitBackgroundClip: "text", color: "transparent" }}>台股難波萬</h1>
          <div className="mt-2 flex items-center gap-3 text-[12px] text-text-2 tracking-[0.3em] pl-[0.3em]">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-[var(--gold)]/60" />自用看盤站<span className="h-px w-8 bg-gradient-to-l from-transparent to-[var(--gold)]/60" />
          </div>
        </div>

        <div className="rounded-[22px] border border-[var(--gold)]/15 bg-[var(--panel)]/85 backdrop-blur-md p-6 shadow-[0_20px_60px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.04)]">
          {/* 讓瀏覽器的密碼管理認得這是哪個網站的密碼 */}
          <input type="text" name="username" autoComplete="username" value="namba" readOnly hidden />
          <label htmlFor="pwd" className="block text-[13px] text-text-2 mb-2">輸入密碼</label>
          <div className={`flex items-center rounded-xl bg-[var(--panel-2)] border transition-colors ${err ? "border-[#f2554f]/60" : "border-line focus-within:border-[var(--gold)]"}`}>
            <input id="pwd" name="password" type={show ? "text" : "password"} autoComplete="current-password" autoFocus value={pwd}
              onChange={(e) => { setPwd(e.target.value); setErr(""); }}
              className="flex-1 min-w-0 bg-transparent px-4 py-3 text-[15px] outline-none tracking-wider" />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "隱藏密碼" : "顯示密碼"} className="px-3 text-text-2 hover:text-text">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
                {show && <line x1="3" y1="3" x2="21" y2="21" />}
              </svg>
            </button>
          </div>
          <div className="h-5 mt-2 text-[12.5px] text-[#f2554f]" role="alert">{err}</div>
          <button type="submit" disabled={busy || !pwd.trim()} className="w-full mt-1 rounded-xl py-3 text-[15px] font-semibold text-[#1a1408] tracking-[0.3em] pl-[0.3em] transition disabled:opacity-50 hover:brightness-110 active:scale-[.99]" style={{ background: "linear-gradient(180deg, #f0d08a, #c99a3c)", boxShadow: "0 6px 20px rgba(217,180,90,.25)" }}>
            {busy ? "確認中…" : "進入"}
          </button>
          <p className="mt-4 text-center text-[11.5px] text-text-2/80">這台裝置會記住一年，不用每次輸入</p>
        </div>
      </form>
    </div>
  );
}
