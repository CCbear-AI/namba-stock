import { chat, parseJson, aiReady } from "@/lib/ai";
import { backtest, normalize, type Spec } from "@/lib/strategy";
import { getBars } from "@/lib/bars";
import { INDUSTRY } from "@/lib/industries";
import { THEMES } from "@/lib/themes";

// AI 策略工作室：{ text, prev? } → AI 把一句話轉成策略規格再回測；{ spec } → 不問 AI，直接用規格回測（存好的策略重跑）
export const maxDuration = 300;

const INDS = Object.values(INDUSTRY).filter((n) => !["管理股票", "存託憑證", "綜合"].includes(n)).join("、");

const SYSTEM = `你把台股選股想法轉成 JSON 策略規格。只能用下面列的條件，只輸出一個 JSON 物件，不要其他文字。

格式：
{"name":"10字內策略名","idea":"一句話重述","universe":{...},"entry":[...],"exit":[...],"hold":{"max":10},"rank":"value","assume":["你自己補的假設"],"unsupported":["做不到的部分"]}

universe（擇一）：
{"k":"all"} 全市場｜{"k":"tse"} 上市｜{"k":"otc"} 上櫃｜{"k":"tw50"} 0050成分股／權值股／大型股｜{"k":"watchlist"} 我的自選股
{"k":"codes","codes":["2330","2454"]} 指定個股（寫代號，不確定代號就寫股票名稱）
{"k":"industry","name":"半導體"} 產業，只能用：${INDS}
{"k":"theme","name":"散熱"} 族群，只能用：${Object.keys(THEMES).join("、")}

entry 進場條件（全部同時成立才買，收盤判斷、隔天開盤買）：
{"k":"aboveMA","n":20} 收盤在N日均線上｜{"k":"belowMA","n":20} 收盤在均線下｜{"k":"crossMA","n":20} 今天剛突破均線
{"k":"maBull"} 均線多頭排列
{"k":"newHigh","n":60} 創N日新高｜{"k":"newLow","n":60} 創N日新低
{"k":"chg","n":5,"min":8} 近N日漲跌幅%（min/max 擇一或都給；跌8%以上寫 "max":-8；n=1 是當天）
{"k":"volRatio","n":20,"min":2} 成交量是前N日均量的幾倍（爆量＝2）
{"k":"price","min":10,"max":100} 股價區間｜{"k":"value","min":5} 成交值至少幾億
{"k":"rsi","n":14,"max":30} RSI
{"k":"foreignBuy","days":3} 外資連買N天｜{"k":"trustBuy","days":3} 投信連買｜{"k":"foreignSell","days":3}｜{"k":"trustSell","days":3}

exit 出場（任一成立就賣）：
{"k":"stopLoss","pct":8} 虧幾%停損｜{"k":"takeProfit","pct":10} 賺幾%停利｜{"k":"trailing","pct":10} 從最高點回落幾%
{"k":"belowMA","n":20} 跌破均線就賣｜{"k":"maxDays","n":10} 最多抱幾個交易日

hold.max：最多同時持有幾檔（沒說用 10；指定個股時用檔數）。rank：訊號太多時優先買誰，"value"成交值大、"chg"漲最多、"volRatio"量最大。

對照：週線5、月線20、季線60、半年線120、年線240；一週5天、兩週10天、一個月20天；連買沒說天數用3；爆量用2倍。
使用者沒講出場時，自己補「虧10%停損＋最多抱20天」並寫進 assume。用不到的欄位不要寫。
本益比、營收、EPS、新聞、PTT、分點等資料這裡沒有 → 寫進 unsupported，其餘照做。`;

async function bench(): Promise<Map<string, number>> {
  const bars = await getBars("0050", "1d");
  return new Map(bars.map((b) => [new Date((b.time + 8 * 3600) * 1000).toISOString().slice(0, 10), b.close]));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; prev?: Spec; spec?: Spec; watchlist?: string[] };
  const watchlist = (body.watchlist ?? []).filter((c) => /^\d{4,6}[A-Z]?$/.test(c)).slice(0, 200);
  let spec: Spec;
  if (body.spec) {
    spec = normalize(body.spec);
  } else {
    const text = String(body.text ?? "").trim().slice(0, 300);
    if (!text) return Response.json({ error: "請先說出你的選股想法" }, { status: 400 });
    if (!aiReady()) return Response.json({ error: "伺服器沒有設定 AI 金鑰" }, { status: 503 });
    const user = body.prev
      ? `目前的策略：${JSON.stringify(body.prev)}\n\n使用者要這樣修改：「${text}」\n請輸出修改後完整的 JSON（沒提到的部分保持不變）。`
      : `選股想法：「${text}」`;
    try {
      const reply = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: user }], { timeout: 240_000, temperature: 0.1 });
      spec = normalize(parseJson<Partial<Spec>>(reply));
    } catch (e) {
      return Response.json({ error: `AI 沒有成功轉出策略：${(e as Error).message}，請再試一次或換個說法` }, { status: 502 });
    }
    if (!spec.entry.length) {
      const miss = spec.unsupported?.length ? `這裡沒有「${spec.unsupported.join("、")}」的資料，` : "";
      return Response.json({ spec, error: `${miss}AI 沒有抓到可以回測的進場條件。請用價格、均線、新高新低、漲跌幅、成交量或法人連買賣來描述「什麼時候買」` }, { status: 422 });
    }
  }
  const b = await bench().catch(() => undefined);
  const result = backtest(spec, { watchlist, bench: b });
  return Response.json({ spec, result });
}
