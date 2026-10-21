"use client";
import Link from "next/link";
import { Suspense, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MiniChart, { type Span } from "@/components/MiniChart";
import ExportBtn from "@/components/ExportBtn";
import { useGroups, useScan } from "@/components/hooks";
import { cls, pct, price } from "@/components/fmt";
import universe from "@/data/universe.json";

const DEFAULT = ["2330", "2317", "2454", "2308", "2382", "3231", "2303", "2881", "2603"];
const SPANS: { k: Span; l: string }[] = [{ k: "day", l: "當日" }, { k: 20, l: "近20日" }, { k: 60, l: "近60日" }, { k: 180, l: "近180日" }];
const NAMES = new Map((universe as { c: string; n: string }[]).map((u) => [u.c, u.n]));
const fit = (k: number) => [2, 4, 6, 9].find((x) => x >= k) ?? 9;

export default function Page() {
  return <Suspense><Multi /></Suspense>;
}

function Multi() {
  const sp = useSearchParams();
  const fromUrl = useMemo(() => sp.get("codes")?.split(",").filter(Boolean) ?? [], [sp]);
  const [n, setN] = useState(fromUrl.length ? fit(fromUrl.length) : 4);
  const [codes, setCodes] = useState<string[]>(fromUrl.length ? [...fromUrl, ...DEFAULT.filter((c) => !fromUrl.includes(c))] : DEFAULT);
  const [span, setSpan] = useState<Span>(fromUrl.length ? 20 : "day");
  const [pick, setPick] = useState(false);
  const g = useGroups();
  const { data: scan } = useScan();
  const rows = useMemo(() => new Map((scan?.rows ?? []).map((r) => [r.c, r])), [scan]);
  const grid = useRef<HTMLDivElement>(null);
  const cols = n <= 4 ? "md:grid-cols-2" : "md:grid-cols-3";
  const [editing, setEditing] = useState<number | null>(null);
  const replace = (i: number, c: string) => {
    setEditing(null);
    const v = c.trim();
    const code = NAMES.has(v) ? v : [...NAMES].find(([, name]) => name === v)?.[0] ?? v;
    if (code) setCodes((old) => { const x = [...old]; x[i] = code; return x; });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">多股看盤</h1>
        <div className="seg">{[2, 4, 6, 9].map((k) => <button key={k} className={n === k ? "on" : ""} onClick={() => setN(k)}>{k} 檔</button>)}</div>
        <div className="seg">{SPANS.map((s) => <button key={s.k} className={span === s.k ? "on" : ""} onClick={() => setSpan(s.k)}>{s.l}</button>)}</div>
        <div className="flex-1" />
        <div className="relative">
          <button className="btn" onClick={() => setPick(!pick)}>☆ 帶入自選股 ›</button>
          {pick && (
            <div className="absolute right-0 mt-1 w-56 card z-30 p-1">
              {g.groups.map((x) => (
                <button key={x.id} disabled={!x.codes.length} className="w-full text-left px-3 py-2 rounded-lg hover:bg-panel-2 disabled:opacity-40 flex"
                  onClick={() => { setCodes([...x.codes, ...DEFAULT.filter((c) => !x.codes.includes(c))].slice(0, 9)); setN(fit(x.codes.length)); setPick(false); }}>
                  {x.name}<span className="ml-auto sub">{x.codes.length} 檔</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <ExportBtn name="多股看盤" target={() => grid.current} />
      </div>
      <div ref={grid} className={`grid gap-4 ${cols}`}>
        {codes.slice(0, n).map((c, i) => {
          const r = rows.get(c);
          const rangePct = span === 20 ? r?.d20 : span === 60 ? r?.d60 : null;
          return (
            <div key={`${c}-${i}`} className="card overflow-hidden">
              <div className="px-4 pt-3 flex items-start gap-2">
                <div>
                  <div className="flex items-baseline gap-2">
                    <Link href={`/stock/${c}`} className="font-semibold hover:text-[var(--gold-2)]">{r?.n ?? NAMES.get(c) ?? c}</Link>
                    <span className="mono text-text-2 text-[12px]">{c}</span>
                  </div>
                  {r && <div className={`mono text-xl ${cls(r.chg)}`}>{price(r.price)} <span className="text-[13px]">{pct(r.pct)}</span></div>}
                </div>
                <div className="ml-auto text-right">
                  {editing === i ? (
                    <input autoFocus placeholder="代號或名稱" className="w-28 bg-panel-2 border border-line rounded px-2 py-0.5 text-[12px]"
                      onKeyDown={(e) => { if (e.key === "Enter") replace(i, e.currentTarget.value); if (e.key === "Escape") setEditing(null); }}
                      onBlur={(e) => (e.currentTarget.value ? replace(i, e.currentTarget.value) : setEditing(null))} />
                  ) : <button data-noexport className="w-7 h-7 rounded-lg bg-panel-2 text-text-2 hover:text-text" title="換一檔" aria-label="換一檔" onClick={() => setEditing(i)}>⇄</button>}
                  {rangePct != null && <div className={`mono text-[12px] ${cls(rangePct)}`}>{SPANS.find((s) => s.k === span)!.l} {pct(rangePct)}</div>}
                  {r && <div className="mono text-[12px] text-text-2">RVOL {r.rvol.toFixed(1)}x</div>}
                </div>
              </div>
              <MiniChart code={c} span={span} prev={r?.prev} height={n >= 6 ? 190 : 250} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
