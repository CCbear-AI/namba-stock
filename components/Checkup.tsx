"use client";
// 個股一眼體檢：程式算的燈號＋學校 AI 一句總結（台股習慣：紅＝強、綠＝弱）
import { useEffect, useState } from "react";
import Help from "./Help";
import type { Checkup as C, Lv } from "@/lib/checkup";

type D = C & { error?: string; ai?: string; aiError?: string; pending?: boolean };

const LV: Record<Lv, { t: string; c: string }> = {
  g: { t: "強", c: "var(--up)" },
  y: { t: "留意", c: "var(--gold)" },
  r: { t: "弱", c: "var(--down)" },
  n: { t: "參考", c: "var(--dim)" },
};

/** 9 個燈號分成 4 格：相關的排在同一格，版面比較清爽 */
const GROUPS = [
  { name: "技術面", ks: ["trend", "mom", "sr"] },
  { name: "法人主力", ks: ["inst", "broker"] },
  { name: "散戶大戶", ks: ["margin", "big"] },
  { name: "基本消息", ks: ["rev", "news"] },
];

export default function Checkup({ code }: { code: string }) {
  const [st, setSt] = useState<{ code: string; d: D } | null>(null);
  const d = st?.code === code ? st.d : null; // 換股時舊資料不顯示
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const setD = (v: D) => setSt({ code, d: v });
    // AI 還在背景算（pending）：每 15 秒再問一次，最多約 4 分鐘
    const load = async (n: number) => {
      try {
        const j: D = await (await fetch(`/api/checkup?code=${code}`, { cache: "no-store" })).json();
        if (stop) return;
        setD(n >= 16 && j.pending ? { ...j, pending: false, aiError: "AI 太久沒回應" } : j);
        if (j.pending && n < 16) timer = setTimeout(() => load(n + 1), 15_000);
      } catch (e) {
        if (!stop) setD({ error: (e as Error).message } as D);
      }
    };
    load(0);
    return () => { stop = true; clearTimeout(timer); };
  }, [code]);

  const color = d?.verdict?.includes("強") ? "var(--up)" : d?.verdict?.includes("弱") ? "var(--down)" : "var(--gold)";
  return (
    <div className="card">
      <div className="card-h">
        一眼體檢
        <Help>燈號全部由程式用盤後資料計算（日K、法人、融資、集保大戶、分點換手、月營收、支撐壓力），每個交易日更新；「強／弱」只看資料狀態，不是買賣建議。AI 總結由 AI 根據燈號撰寫，每檔每天寫一次。</Help>
        {d && !d.error && <span className="sub ml-auto mono">{d.date.slice(5).replace("-", "/")} 收盤</span>}
      </div>
      {!d ? <div className="sub px-3 pb-3 loading">體檢中…</div> : d.error ? <div className="sub px-3 pb-3">{d.error}</div> : (
        <div className="px-3 pb-3 grid gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-lg font-bold" style={{ color }}>{d.verdict}</span>
            <span className="sub mono">強 {d.good} · 弱 {d.bad}</span>
            <span className="text-[14px] flex-1 min-w-[16rem]">
              {d.ai ? <>🤖 {d.ai}</> : d.pending ? <span className="loading text-[13px]">AI 總結撰寫中（AI 主機較慢，約 1～2 分鐘）…</span>
                : <span className="sub text-[12px]">AI 總結暫時無法使用（{d.aiError}）</span>}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {GROUPS.map((g) => {
              const ls = g.ks.map((k) => d.lights.find((l) => l.k === k)).filter((l): l is C["lights"][number] => !!l);
              if (!ls.length) return null;
              return (
                <div key={g.name} className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px]">
                  <div className="sub text-[12px] font-semibold mb-1">{g.name}</div>
                  <div className="grid gap-1.5">
                    {ls.map((l) => (
                      <div key={l.k}>
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: LV[l.lv].c }} />
                          <b className="font-semibold">{l.name}</b>
                          <span className="ml-auto text-[12px]" style={{ color: LV[l.lv].c }}>{LV[l.lv].t}</span>
                        </div>
                        <div className="text-text-2 leading-snug pl-4">{l.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
