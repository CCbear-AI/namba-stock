// 讀 data/ 底下的盤後資料（日 K、籌碼、歷史高低、集保、期貨），伺服器端共用，記憶體快取 10 分鐘
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
const TTL = 10 * 60_000;

function cached<T>(fn: () => T) {
  let hit: { at: number; v: T } | null = null;
  return () => {
    if (!hit || Date.now() - hit.at > TTL) hit = { at: Date.now(), v: fn() };
    return hit.v;
  };
}
const readJson = <T,>(f: string): T => JSON.parse(readFileSync(f, "utf8"));
const listDays = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort() : []);

/** 一檔股票的日 K 序列，跟 dates 對齊；沒交易的那天是 NaN */
export type Series = { o: number[]; h: number[]; l: number[]; c: number[]; v: number[]; val: number[] };
export type Daily = { dates: string[]; s: Map<string, Series> };

export const getDaily = cached((): Daily => {
  const files = listDays(path.join(DATA, "daily"));
  const dates = files.map((f) => f.slice(0, 10));
  const s = new Map<string, Series>();
  const n = files.length;
  files.forEach((f, i) => {
    const day = readJson<{ s: Record<string, number[]> }>(path.join(DATA, "daily", f)).s;
    for (const [c, [o, h, l, cl, v, val]] of Object.entries(day)) {
      let x = s.get(c);
      if (!x) {
        const arr = () => new Array<number>(n).fill(NaN);
        x = { o: arr(), h: arr(), l: arr(), c: arr(), v: arr(), val: arr() };
        s.set(c, x);
      }
      x.o[i] = o; x.h[i] = h; x.l[i] = l; x.c[i] = cl; x.v[i] = v; x.val[i] = val;
    }
  });
  return { dates, s };
});

/** 籌碼：代號 → 每天 [外資, 投信, 自營商, 融資餘額, 融券餘額, 融資限額, 外資持股%, 借券賣出餘額, 當沖%] */
export type ChipDay = { date: string; s: Record<string, number[]>; m: Record<string, number> };
export const getChips = cached((): ChipDay[] =>
  listDays(path.join(DATA, "chips")).map((f) => readJson<ChipDay>(path.join(DATA, "chips", f))),
);

/** 上市櫃以來最高／最低（到 upTo 那天收盤為止） */
export const getAth = cached(() => {
  const f = path.join(DATA, "ath.json");
  type A = Record<string, [number, string, number, string]>;
  return existsSync(f) ? readJson<{ upTo: string; s: A; prev?: A }>(f) : { upTo: "", s: {} as A, prev: undefined };
});

/** 集保：最近幾週 [千張大戶%, 股東人數] */
export const getTdcc = cached(() =>
  listDays(path.join(DATA, "tdcc")).map((f) => readJson<{ date: string; s: Record<string, [number, number]> }>(path.join(DATA, "tdcc", f))),
);

export type FutDay = { tx: [number, number, number]; top10: number; pcr: number; retail: number; fOpt: [number, number] };
export const getFutures = cached(() => {
  const f = path.join(DATA, "futures.json");
  return existsSync(f) ? readJson<Record<string, FutDay>>(f) : {};
});

/** 最後一個有值的位置（往回找） */
export function lastIdx(a: number[], from = a.length - 1) {
  for (let i = from; i >= 0; i--) if (!Number.isNaN(a[i])) return i;
  return -1;
}
