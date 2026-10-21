"use client";
// 可拖曳換位置的面板格線：按住面板頂端的小橫條拖到別的面板上就會交換位置，順序存在這台裝置
import { useState, useSyncExternalStore } from "react";
import { localStore } from "./hooks";

const stores = new Map<string, ReturnType<typeof localStore<string[]>>>();
const NONE: string[] = [];
function useOrder(key: string) {
  if (!stores.has(key)) stores.set(key, localStore<string[]>(key, () => []));
  const st = stores.get(key)!;
  return [useSyncExternalStore(st.subscribe, st.read, () => NONE), st.write] as const;
}

export default function DragGrid({ panels, storageKey }: { panels: Record<string, { span: string; node: React.ReactNode }>; storageKey: string }) {
  const ids = Object.keys(panels);
  const [saved, save] = useOrder(storageKey);
  // 存下來的順序 + 新增的面板
  const order = [...saved.filter((id) => panels[id]), ...ids.filter((id) => !saved.includes(id))];
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null); // 只有按住橫條時才能拖，避免跟圖表、捲動衝突

  const drop = (target: string) => {
    if (!dragging || dragging === target) return;
    const next = order.filter((x) => x !== dragging);
    next.splice(next.indexOf(target) + (order.indexOf(dragging) < order.indexOf(target) ? 1 : 0), 0, dragging);
    save(next);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {order.map((id) => (
        <div key={id} className={`drag-cell relative ${panels[id].span} ${dragging === id ? "opacity-40" : ""} ${over === id && dragging && dragging !== id ? "outline outline-2 outline-[var(--gold)] rounded-[22px]" : ""}`}
          draggable={armed === id}
          onDragStart={(e) => { setDragging(id); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => { setDragging(null); setOver(null); setArmed(null); }}
          onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(id); } }}
          onDragLeave={() => setOver((o) => (o === id ? null : o))}
          onDrop={(e) => { e.preventDefault(); drop(id); setOver(null); }}>
          <button data-noexport aria-label="拖曳移動這個面板" title="拖曳移動這個面板"
            onPointerDown={() => setArmed(id)} onPointerUp={() => setArmed(null)}
            className="absolute left-1/2 -translate-x-1/2 top-1.5 z-20 h-3 w-12 flex items-center justify-center cursor-grab active:cursor-grabbing group">
            <span className="block h-1 w-8 rounded-full bg-[#2b3038] group-hover:bg-[#4a515c]" />
          </button>
          {panels[id].node}
        </div>
      ))}
      {saved.length > 0 && (
        <div className="lg:col-span-12 text-right">
          <button className="sub hover:text-text" onClick={() => save([])}>恢復預設排列</button>
        </div>
      )}
    </div>
  );
}
