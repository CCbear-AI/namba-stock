// 富邦 DJ 公開資訊頁「主力進出」（非正式 API）：某檔在 from~to 期間買超前 15、賣超前 15 的券商分點
// 期間超過一天時是富邦自己把整段加總後排名，會包含每天都沒進前 15、但累積起來很大的分點
const num = (s: string) => Number(s.replace(/[,%]/g, "")) || 0;

export type ZcoRow = [id: string, buy: number, sell: number];
/** bh：分點代號 → 富邦頁的 BHID（跟分點代號不同的才記；查單一分點明細時要帶，不帶有時會慢到 20 秒） */
export type Zco = { vol: number; rows: ZcoRow[]; names: Record<string, string>; bh: Record<string, string> };

export async function fetchZco(code: string, from: string, to = from): Promise<Zco | null> {
  const url = `https://fubon-ebrokerdj.fbs.com.tw/z/zc/zco/zco.djhtm?a=${code}&e=${from}&f=${to}`;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return parseZco(new TextDecoder("big5").decode(await r.arrayBuffer()));
    } catch {
      await new Promise((ok) => setTimeout(ok, 1000 * (k + 1)));
    }
  }
  return null;
}

function parseZco(html: string): Zco {
  const rows: ZcoRow[] = [];
  const names: Record<string, string> = {};
  const bh: Record<string, string> = {};
  let absSum = 0, pctSum = 0;
  for (const tr of html.split(/<tr[^>]*>/i)) {
    // 一列：買超券商, 買進, 賣出, 買超, 佔比, 賣超券商, 買進, 賣出, 賣超, 佔比
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length !== 10) continue;
    for (const o of [0, 5]) {
      const id = tds[o].match(/[?&]b=([^&"]+)/)?.[1];
      if (!id) continue;
      const h = tds[o].match(/BHID=([^&"]+)/)?.[1];
      if (h && h !== id) bh[id] = h;
      const txt = (i: number) => tds[o + i].replace(/<[^>]+>/g, "").trim();
      names[id] = txt(0);
      rows.push([id, num(txt(1)), num(txt(2))]);
      absSum += Math.abs(num(txt(3)));
      pctSum += num(txt(4));
    }
  }
  // 成交量用分點頁自己的「佔成交比」反推（跟 /api/branch 一樣）
  return { vol: pctSum ? Math.round((absSum / pctSum) * 100) : 0, rows, names, bh };
}

/** 單一分點對單一股票近 60 個交易日的逐日買進／賣出（含沒進前 15 名的日子） */
export async function fetchZco0(code: string, id: string, bhid?: string): Promise<{ date: string; buy: number; sell: number }[] | null> {
  const url = `https://fubon-ebrokerdj.fbs.com.tw/z/zc/zco/zco0/zco0.djhtm?a=${code}&b=${id}${bhid ? `&BHID=${bhid}` : ""}&C=3`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(25_000) });
    if (!r.ok) return null;
    const html = new TextDecoder("big5").decode(await r.arrayBuffer());
    const out: { date: string; buy: number; sell: number }[] = [];
    for (const tr of html.split(/<tr[^>]*>/i)) {
      // 一列：日期, 買進, 賣出, 買賣總額, 買賣超
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
      if (tds.length !== 5 || !/^\d{4}\/\d\d\/\d\d$/.test(tds[0])) continue;
      out.push({ date: tds[0].replace(/\//g, "-"), buy: num(tds[1]), sell: num(tds[2]) });
    }
    return out;
  } catch {
    return null;
  }
}
