// 個股新聞：鉅亨網台股新聞（每則標好相關個股），存在 data/stocknews/發布日期.json；
// 有新消息的個股由學校 AI 寫「近一週重點」存在 data/stocknews/digest.json（scripts/stock-news.ts 寫入），網站只讀檔案
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type SNews = { id: number; t: string; s: string; at: number; c: string[] }; // t 標題、s 摘要、at 發布時間、c 相關個股
export type Digest = { d: string; text: string; tone: "多" | "空" | "中"; src: number[]; at: number };

export const SNEWS_DIR = path.join(process.cwd(), "data", "stocknews");
export const DIGEST_FILE = path.join(SNEWS_DIR, "digest.json");
export const newsUrl = (id: number) => `https://news.cnyes.com/news/id/${id}`;

export function snewsDates() {
  return existsSync(SNEWS_DIR) ? readdirSync(SNEWS_DIR).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).map((f) => f.slice(0, 10)).sort() : [];
}
export function readSnewsDay(date: string): SNews[] {
  const f = path.join(SNEWS_DIR, `${date}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
}
export function readDigests(): Record<string, Digest> {
  return existsSync(DIGEST_FILE) ? JSON.parse(readFileSync(DIGEST_FILE, "utf8")).items ?? {} : {};
}

// 記憶體快取 10 分鐘（排程寫檔、部署後最多 10 分鐘就看得到）
let hit: { at: number; days: SNews[][]; dg: Record<string, Digest> } | null = null;
function load() {
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit;
  hit = { at: Date.now(), days: snewsDates().slice(-60).map(readSnewsDay), dg: readDigests() };
  return hit;
}

/** 某檔近 60 天新聞（新到舊）＋AI 近一週重點 */
export function stockNewsOf(code: string) {
  const { days, dg } = load();
  const news = days.flat().filter((x) => x.c.includes(code)).sort((a, b) => b.at - a.at).slice(0, 40);
  return { news, digest: dg[code] ?? null };
}
