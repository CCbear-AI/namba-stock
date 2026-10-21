"use client";
// 技術指標選單：搜尋、分類、開關、改參數、一鍵套用「量價四步」
import { useMemo, useState } from "react";
import { CATS, INDICATORS, IND, FOUR_STEP, type IndSetting } from "@/lib/indicators";

export const MAX_SUB = 4;

export default function IndicatorMenu({ value, onChange, onClose }: { value: IndSetting[]; onChange: (v: IndSetting[]) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<string | null>(null);
  const on = new Map(value.map((v) => [v.id, v]));
  const subCount = value.filter((v) => !IND[v.id]?.overlay).length;

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? INDICATORS.filter((x) => `${x.name}${x.abbr}${x.desc}`.toLowerCase().includes(s)) : null;
  }, [q]);

  const toggle = (id: string) => {
    if (on.has(id)) onChange(value.filter((v) => v.id !== id));
    else {
      const ind = IND[id];
      if (!ind.overlay && subCount >= MAX_SUB) return;
      onChange([...value, { id, params: [...ind.params] }]);
    }
  };
  const setParams = (id: string, params: number[]) => onChange(value.map((v) => (v.id === id ? { ...v, params } : v)));

  const row = (id: string) => {
    const ind = IND[id];
    const cur = on.get(id);
    const full = !cur && !ind.overlay && subCount >= MAX_SUB;
    return (
      <div key={id} className="px-3 py-2 rounded-lg hover:bg-panel-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[13px]">{ind.name} <span className="mono text-text-2">{ind.abbr}{(cur?.params ?? ind.params).length ? `(${(cur?.params ?? ind.params).join(", ")})` : ""}</span></div>
            <div className="sub truncate">{ind.overlay ? "疊圖" : "副圖"} · {ind.desc}</div>
          </div>
          {cur && ind.params.length > 0 && <button className="text-text-2 hover:text-text px-1" title="改參數" aria-label="改參數" onClick={() => setEdit(edit === id ? null : id)}>⚙</button>}
          <button
            role="switch" aria-checked={!!cur} aria-label={`${ind.name} ${ind.abbr} ${cur ? "已開啟" : "已關閉"}`} disabled={full}
            title={full ? `副圖最多 ${MAX_SUB} 個，先關掉一個` : undefined}
            onClick={() => toggle(id)}
            className={`w-9 h-5 rounded-full relative transition ${cur ? "bg-[var(--gold)]" : "bg-[#3a3f47]"} ${full ? "opacity-40" : ""}`}
          ><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#111] transition-all ${cur ? "left-[18px]" : "left-0.5"}`} /></button>
        </div>
        {edit === id && cur && (
          <div className="flex flex-wrap gap-2 mt-2">
            {cur.params.map((v, i) => (
              <input key={i} type="number" step="any" defaultValue={v} className="w-20 bg-panel-2 border border-line rounded px-2 py-1 mono text-[12px]"
                onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0) { const p = [...cur.params]; p[i] = n; setParams(id, p); } }} />
            ))}
            <button className="btn !py-0.5 text-[12px]" onClick={() => setParams(id, [...ind.params])}>預設值</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="absolute right-3 top-12 z-20 w-[380px] max-w-[calc(100%-1.5rem)] max-h-[70vh] flex flex-col rounded-xl border border-line bg-[#101215]/98 backdrop-blur shadow-2xl">
      <div className="flex items-center px-4 pt-3 pb-2 font-semibold">技術指標<button className="ml-auto text-text-2 hover:text-text" aria-label="關閉" onClick={onClose}>✕</button></div>
      <div className="px-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋指標：RSI、乖離、布林、雲…" className="w-full bg-panel-2 border border-line rounded-lg px-3 py-1.5 text-[13px] outline-none focus:border-[var(--gold)]" /></div>
      <div className="scroll-y flex-1 px-1 py-2">
        {!hits && (
          <div className="mx-2 mb-2 rounded-lg border border-line p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="font-semibold text-[13px]">量價四步 <span className="mono text-text-2">RVOL · ER · ABS · POC</span></div>
              <div className="sub mt-1">今天熱不熱（RVOL）→ 量有沒有換成推進（推進效率）→ 爆量卡在哪（吸收候選）→ 成交最密集在哪（POC）</div>
            </div>
            <button className="btn gold" onClick={() => onChange(FOUR_STEP.map((x) => ({ ...x, params: [...x.params] })))}>一鍵套用</button>
          </div>
        )}
        {hits ? hits.map((x) => row(x.id)) : (
          <>
            <div className="px-3 pt-1 pb-1 sub flex">已啟用 {value.length}<span className="ml-auto">副圖 {subCount}／{MAX_SUB}</span></div>
            {value.map((v) => row(v.id))}
            {CATS.map((c) => {
              const list = INDICATORS.filter((x) => x.cat === c);
              return (
                <div key={c}>
                  <button className="w-full flex items-center px-3 py-2 text-[13px] font-semibold hover:text-[var(--gold-2)]" onClick={() => setOpen({ ...open, [c]: !open[c] })}>
                    {c} <span className="sub ml-2">{list.length}</span><span className="ml-auto text-text-2">{open[c] ? "▾" : "▸"}</span>
                  </button>
                  {open[c] && list.map((x) => row(x.id))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
