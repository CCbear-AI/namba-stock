// K 線資料（/api/candles 與 AI 支撐壓力共用）
import { yahooBars, yahooSymbol, resample, type TF } from "@/lib/yahoo";
import { sectorDaily, sectorIntraday, taiexDaily } from "@/lib/sector";
import { BY_CODE } from "@/lib/universe";
import { misOhlc } from "@/lib/misStats";
import type { Bar } from "@/lib/types";
import { getDaily } from "@/lib/history";
import { getQuotes, ch } from "@/lib/mis";

// ?code=2330 | TAIEX | OTC | sector:t24  &tf=1m|5m|15m|30m|60m|1d|1wk|1mo
export async function getBars(code: string, tf: TF): Promise<Bar[]> {
  let bars: Bar[];
  if (code === "OTC") {
    // 櫃買指數：分時用 MIS 每分鐘資料，日 K 用櫃買歷史（data/sector-otc.json）＋今天即時
    if (tf.endsWith("m") && tf !== "1mo") {
      const m1 = (await misOhlc("OTC")).minutes.map((x) => ({ time: Math.floor(x.t / 1000) - 60, open: x.c, high: x.c, low: x.c, close: x.c, volume: x.v }));
      bars = tf === "1m" ? m1 : groupMinutes(m1, Number(tf.slice(0, -1)));
    } else {
      const d = await sectorDaily("o00");
      bars = tf === "1d" ? d : resample(d, tf as "1wk" | "1mo");
    }
  } else if (code === "TAIEX" && (tf === "1d" || tf === "1wk" || tf === "1mo")) {
    // 加權指數日 K 用證交所官方資料；週／月 K 的 2024-10 以前沿用 Yahoo
    const d = await taiexDaily();
    if (tf === "1d") bars = d;
    else {
      const mine = resample(d, tf);
      const old = mine.length ? (await yahooBars("^TWII", tf).catch(() => [] as Bar[])).filter((b) => b.time < mine[0].time) : [];
      bars = [...old, ...mine];
    }
  } else if (code.startsWith("sector:")) {
    const id = code.slice(7);
    if (tf.endsWith("m") && tf !== "1mo") {
      const m1 = await sectorIntraday(id);
      bars = tf === "1m" ? m1 : groupMinutes(m1, Number(tf.slice(0, -1)));
    } else {
      const d = await sectorDaily(id);
      bars = tf === "1d" ? d : resample(d, tf as "1wk" | "1mo");
    }
  } else {
    const s = BY_CODE.get(code);
    let m: "tse" | "otc" = s?.m ?? "tse";
    bars = await yahooBars(yahooSymbol(code, m), tf);
    if (!bars.length && !s) { m = "otc"; bars = await yahooBars(yahooSymbol(code, m), tf); }
    if (tf === "1d") bars = await withOfficial(code, m, bars);
    if (tf === "1m") bars = await closingAuction(code, m, bars);
  }
  return bars;
}

function groupMinutes(bars: Bar[], n: number): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const key = Math.floor(b.time / (n * 60)) * n * 60;
    const last = out[out.length - 1];
    if (last && last.time === key) { last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low); last.close = b.close; last.volume += b.volume; }
    else out.push({ ...b, time: key });
  }
  return out;
}

/**
 * 個股日 K：有官方日 K（data/daily）的日子改用官方開高低收量（成交量含盤後、鉅額，Yahoo 的量常對不上）；
 * 今天還沒有官方資料就用即時報價補（跟里長伯一致）
 */
async function withOfficial(code: string, m: "tse" | "otc", bars: Bar[]): Promise<Bar[]> {
  const { dates, s } = getDaily();
  const x = s.get(code);
  // Yahoo 在休市日（例如 10/23 颱風）也會補一根量 0、價格沿用前一天的 K 棒，會拉偏均線 → 官方日 K 涵蓋期間只留官方交易日
  const days = new Set(dates.map((d) => Date.parse(d) / 1000));
  const first = Date.parse(dates[0] ?? "") / 1000, end = Date.parse(dates.at(-1) ?? "") / 1000;
  const map = new Map(bars.filter((b) => !(b.time >= first && b.time <= end && !days.has(b.time))).map((b) => [b.time, b]));
  if (x) dates.forEach((d, i) => {
    if (!(x.c[i] > 0)) return;
    const t = Date.parse(d) / 1000;
    map.set(t, { time: t, open: x.o[i], high: x.h[i], low: x.l[i], close: x.c[i], volume: x.v[i] });
  });
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  if (dates.at(-1) !== today) {
    const [q] = await getQuotes([ch(m, code)]).catch(() => []);
    if (q?.price && q.vol && new Date(q.time + 8 * 3600e3).toISOString().slice(0, 10) === today) {
      const t = Date.parse(today) / 1000;
      map.set(t, { time: t, open: q.open, high: q.high, low: q.low, close: q.price, volume: q.vol });
    }
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

/** Yahoo 分鐘線收盤那根（13:30 集合競價）量是 0：用全天成交量扣掉前面每分鐘的量補回去 */
async function closingAuction(code: string, m: "tse" | "otc", bars: Bar[]): Promise<Bar[]> {
  const last = bars.at(-1);
  if (!last || last.volume > 0 || new Date(last.time * 1000 + 8 * 3600e3).toISOString().slice(11, 16) !== "13:30") return bars;
  const [q] = await getQuotes([ch(m, code)]).catch(() => []);
  const rest = q?.vol ? q.vol - bars.slice(0, -1).reduce((a, b) => a + b.volume, 0) : 0;
  return rest > 0 ? [...bars.slice(0, -1), { ...last, volume: rest }] : bars;
}
