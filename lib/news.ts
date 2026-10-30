// 重大訊息：證交所／櫃買中心開放資料（每天早上放出前一個交易日的公告），每則由學校 AI 寫成一句白話摘要。
// 存在 data/news/發言日期.json（scripts/news.ts 寫入），網站只讀檔案
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type News = {
  c: string; n: string;
  d: string; // 發言日期 YYYY-MM-DD
  t: string; // 發言時間 HH:MM
  title: string; // 原文主旨
  body?: string; // 原文說明（摘要寫好就刪掉，不佔空間）
  sum?: string; // AI 一句話摘要
  tag?: string; // 分類
  imp?: 1 | 2 | 3; // 重要程度：3 可能影響股價、2 一般營運、1 例行公告
  rep?: boolean; // 近期同一家公司同樣主旨的重複公告（例如更名要連續公告三個月），不顯示
};
export type NewsDay = { date: string; items: News[] };

export const NEWS_DIR = path.join(process.cwd(), "data", "news");
export const NEWS_TAGS = ["營收獲利", "股利", "增減資", "併購投資", "接單合作", "擴產", "人事", "法說會", "股東會", "庫藏股", "注意處置", "澄清", "其他"] as const;

export function newsDates() {
  return existsSync(NEWS_DIR) ? readdirSync(NEWS_DIR).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).map((f) => f.slice(0, 10)).sort() : [];
}
export function readNewsDay(date: string): NewsDay {
  const f = path.join(NEWS_DIR, `${date}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { date, items: [] };
}

// 記憶體快取 10 分鐘（排程寫檔後最多 10 分鐘就看得到）
let hit: { at: number; days: NewsDay[] } | null = null;
function recent(): NewsDay[] {
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.days;
  const days = newsDates().slice(-90).map(readNewsDay);
  hit = { at: Date.now(), days };
  return days;
}

const shown = (x: News) => !x.rep;
const byTime = (a: News, b: News) => (a.d === b.d ? b.t.localeCompare(a.t) : b.d.localeCompare(a.d));

/** 某檔近 N 天的重大訊息（新到舊） */
export function newsOf(code: string, days = 60): News[] {
  const all = recent();
  return all.slice(-days).flatMap((d) => d.items.filter((x) => x.c === code && shown(x))).sort(byTime).map(({ body: _, ...x }) => x); // eslint-disable-line @typescript-eslint/no-unused-vars
}

/** 一群股票從 since（含）以後的重大訊息 */
export function newsFor(codes: string[], since: string): News[] {
  const set = new Set(codes);
  return recent().filter((d) => d.date >= since).flatMap((d) => d.items.filter((x) => set.has(x.c) && shown(x))).sort(byTime).map(({ body: _, ...x }) => x); // eslint-disable-line @typescript-eslint/no-unused-vars
}
