import { getDaily } from "@/lib/history";

// 主力分點（券商買賣超前 15 名）：資料來自富邦證券 DJ 公開資訊頁（非正式 API）
// ?code=2330&days=1|5
const cache = new Map<string, { at: number; v: unknown }>();
const num = (s: string) => Number(s.replace(/[,%]/g, "")) || 0;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = sp.get("code") ?? "";
  const days = sp.get("days") === "5" ? 5 : 1;
  if (!/^\w{4,6}$/.test(code)) return Response.json({ error: "代號不對" }, { status: 400 });
  const { dates, s } = getDaily();
  const range = dates.slice(-days);
  if (!range.length) return Response.json({ error: "還沒有日 K 資料" }, { status: 404 });
  const key = `${code}:${range.join()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return Response.json(hit.v);

  const url = `https://fubon-ebrokerdj.fbs.com.tw/z/zc/zco/zco.djhtm?a=${code}&e=${range[0]}&f=${range.at(-1)}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = new TextDecoder("big5").decode(await r.arrayBuffer());
    const buy: { n: string; lots: number; pct: number }[] = [];
    const sell: { n: string; lots: number; pct: number }[] = [];
    for (const tr of html.split(/<tr[^>]*>/i)) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
      // 一列：買超券商, 買進, 賣出, 買超, 佔比, 賣超券商, 買進, 賣出, 賣超, 佔比
      if (cells.length !== 10 || !/\d/.test(cells[3])) continue;
      if (cells[0]) buy.push({ n: cells[0], lots: num(cells[3]), pct: num(cells[4]) });
      if (cells[5]) sell.push({ n: cells[5], lots: -num(cells[8]), pct: num(cells[9]) });
    }
    // 分母用分點頁自己的成交量（由各券商「佔成交比」反推，跟里長伯一致）；反推不出來才用官方日 K 成交量
    const all = [...buy, ...sell].filter((y) => y.pct > 0);
    const pctSum = all.reduce((a, y) => a + y.pct, 0);
    const implied = pctSum ? (all.reduce((a, y) => a + Math.abs(y.lots), 0) / pctSum) * 100 : 0;
    const x = s.get(code);
    const vol = implied || (x ? range.reduce((a, d) => { const i = dates.indexOf(d); return a + (Number.isNaN(x.v[i]) ? 0 : x.v[i]); }, 0) : 0);
    const b = buy.reduce((a, y) => a + y.lots, 0), se = sell.reduce((a, y) => a + y.lots, 0);
    const v = { code, from: range[0], to: range.at(-1), days, buy, sell, buySum: b, sellSum: se, conc: vol ? Math.round(((b + se) / vol) * 10000) / 100 : null };
    if (buy.length) cache.set(key, { at: Date.now(), v });
    return Response.json(v);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
