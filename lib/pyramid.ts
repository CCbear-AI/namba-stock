// 神秘金字塔（norway.twsthr.info）個股股權分散歷史：每週千張大戶比例、400 張以上大戶比例、股東人數
// 資料源頭是集保每週公布；這個網站整理了多年歷史，比集保開放資料（只有最新一週）好用
export type HolderWeek = { date: string; holders: number; big: number; big400: number; close: number };

const cache = new Map<string, { at: number; v: HolderWeek[] }>();
const num = (s: string) => Number(s.replace(/,/g, "")) || 0;

export async function holderHistory(code: string): Promise<HolderWeek[]> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < 12 * 3600e3) return hit.v;
  const r = await fetch(`https://norway.twsthr.info/StockHolders.aspx?stock=${encodeURIComponent(code)}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`神秘金字塔 ${r.status}`);
  const html = new TextDecoder("big5").decode(await r.arrayBuffer());
  const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1].replace(/<[^>]+>|&nbsp;/g, "").trim());
  // 每週一組：日期, 集保總張數, 總股東人數, 平均張數, >400張持有張數, >400張%, >400張人數, 400~600, 600~800, 800~1000, >1000張人數, >1000張%, 收盤價
  const out: HolderWeek[] = [];
  const seen = new Set<string>();
  for (let i = 0; i + 12 < cells.length; i++) {
    if (!/^20\d{6}$/.test(cells[i]) || !/^[\d,]+$/.test(cells[i + 1]) || !/^[\d,]+$/.test(cells[i + 2])) continue;
    const d = cells[i];
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    if (seen.has(date)) continue;
    seen.add(date);
    out.push({ date, holders: num(cells[i + 2]), big400: num(cells[i + 5]), big: num(cells[i + 11]), close: num(cells[i + 12]) });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  if (out.length) cache.set(code, { at: Date.now(), v: out });
  return out;
}
