// 資金流資料存放：有設定 Supabase 就存 Supabase（盤中即時），否則存 data/flow/*.json
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { FlowDay } from "./flow";

const URL_ = process.env.SUPABASE_URL?.trim();
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();
export const hasSupabase = Boolean(URL_ && KEY);

async function sb(pathq: string, init?: RequestInit) {
  const r = await fetch(`${URL_}/rest/v1/${pathq}`, {
    ...init,
    headers: {
      apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r;
}

/** 表格：flow_days(date text primary key, data jsonb, updated_at timestamptz) */
export async function saveFlowDayRemote(day: FlowDay) {
  await sb("flow_days?on_conflict=date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ date: day.date, data: day, updated_at: new Date().toISOString() }),
  });
}

const DIR = path.join(process.cwd(), "data", "flow");

export async function listFlowDays(): Promise<string[]> {
  const set = new Set<string>();
  if (existsSync(DIR)) for (const f of readdirSync(DIR)) if (f.endsWith(".json")) set.add(f.slice(0, 10));
  if (hasSupabase) {
    try {
      const r = await sb("flow_days?select=date&order=date.desc&limit=120");
      for (const x of (await r.json()) as { date: string }[]) set.add(x.date);
    } catch { /* 沒連上就只用本機檔案 */ }
  }
  return [...set].sort().reverse();
}

export async function getFlowDay(date?: string): Promise<FlowDay | null> {
  const d = date ?? (await listFlowDays())[0];
  if (!d) return null;
  if (hasSupabase) {
    try {
      const r = await sb(`flow_days?select=data&date=eq.${encodeURIComponent(d)}`);
      const rows = (await r.json()) as { data: FlowDay }[];
      if (rows[0]) return rows[0].data;
    } catch { /* 改讀本機 */ }
  }
  const f = path.join(DIR, `${d}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}
