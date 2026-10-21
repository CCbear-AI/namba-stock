// 用今天加權指數每分鐘成交量，更新「平常日累積量能曲線」（RVOL 用）
// 跟舊曲線做移動平均，避免單一天特別怪；收盤後跑
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { misOhlc } from "../lib/misStats";

async function main() {
  const { minutes } = await misOhlc("TSE");
  if (minutes.length < 200) return console.log("今天分鐘資料不完整，略過");
  const total = minutes.reduce((a, m) => a + m.v, 0);
  if (!total) return console.log("沒有量，略過");
  const at: [number, number][] = [[540, 0]];
  let acc = 0;
  for (const m of minutes) {
    acc += m.v;
    const d = new Date(m.t + 8 * 3600e3), mm = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (mm % 15 === 0 || mm === 541 || mm === 545 || mm === 805) at.push([mm, Math.round((acc / total) * 1000) / 1000]);
  }
  at.push([810, 1]);
  const f = "data/volcurve.json";
  const old: [number, number][] | null = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).pts : null;
  const pts = old ? at.map(([m, v]) => { const o = old.find((x) => x[0] === m); return [m, o ? Math.round((o[1] * 0.8 + v * 0.2) * 1000) / 1000 : v] as [number, number]; }) : at;
  writeFileSync(f, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), pts }));
  console.log("量能曲線", pts.length, "點");
}
main().catch((e) => { console.error(e); process.exit(1); });
