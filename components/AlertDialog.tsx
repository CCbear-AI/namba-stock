"use client";
// 個股頁的「設定提醒」視窗：到價、漲跌幅、漲跌停
import { useState } from "react";
import { useRules } from "./alerts";
import { pushOn } from "./push";
import { describe, type Rule } from "@/lib/alertRules";

export default function AlertDialog({ code, name, price, onClose }: { code: string; name: string; price: number; onClose: () => void }) {
  const { add } = useRules();
  const [kind, setKind] = useState<"price" | "pct" | "limit">("price");
  const [dir, setDir] = useState<"above" | "below" | "up" | "down">("above");
  const [value, setValue] = useState(String(price || ""));
  const [done, setDone] = useState(false);
  const v = Number(value);
  const rule: Omit<Rule, "id" | "created" | "on"> | null =
    kind === "limit" ? { kind, code, name } : v > 0 ? { kind, code, name, dir: kind === "price" ? (dir === "below" ? "below" : "above") : dir === "down" ? "down" : "up", value: v } : null;
  const pick = (k: typeof kind) => { setKind(k); setDir(k === "pct" ? "up" : "above"); setValue(k === "pct" ? "3" : String(price || "")); };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-label="設定提醒" className="card w-full max-w-[420px] p-5 grid gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center font-semibold text-[16px]">設定提醒<button className="ml-auto text-text-2 hover:text-text" aria-label="關閉" onClick={onClose}>✕</button></div>
        <div className="flex"><span className="mono text-text-2 mr-2">{code}</span><b>{name}</b><span className="ml-auto sub">現價 {price.toLocaleString()}</span></div>
        <div className="seg grid grid-cols-3">{([["price", "到價"], ["pct", "漲跌幅"], ["limit", "漲跌停"]] as const).map(([k, l]) => <button key={k} className={kind === k ? "on" : ""} onClick={() => pick(k)}>{l}</button>)}</div>
        {kind !== "limit" && (
          <div className="flex gap-2">
            <div className="seg">{(kind === "price" ? [["above", "高於"], ["below", "低於"]] : [["up", "漲幅"], ["down", "跌幅"]]).map(([k, l]) => <button key={k} className={dir === k ? "on" : ""} onClick={() => setDir(k as typeof dir)}>{l}</button>)}</div>
            <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="flex-1 min-w-0 bg-panel-2 border border-line rounded-lg px-3 mono text-right text-lg" />
            <span className="sub self-center">{kind === "price" ? "元" : "%"}</span>
          </div>
        )}
        <p className="sub leading-relaxed">{rule ? `${describe({ ...rule, id: "", created: 0, on: true } as Rule)}時，會在這個網頁跳出通知。` : "填一個數字"}{pushOn() ? "已開啟背景推播，網頁關掉也會收到。" : "提醒存在這台裝置，網頁開著才會檢查（可到提醒頁開啟背景推播）。"}</p>
        <button className="btn gold justify-center py-2.5" disabled={!rule || done} onClick={() => { if (rule) { add(rule); setDone(true); setTimeout(onClose, 700); } }}>{done ? "已建立 ✓" : "建立提醒"}</button>
      </div>
    </div>
  );
}
