// 盤後法人買超提醒：每天籌碼資料更新後跑一次（daily-data workflow）
import { getMarket } from "../lib/market";
import { scan } from "../lib/scan";
import { checkAndPush, pushReady } from "../lib/pushServer";

async function main() {
  if (!pushReady) return console.log("沒有設定推播，略過");
  const m = await getMarket();
  const day = new Date(m.time + 8 * 3600e3).toISOString().slice(0, 10);
  const sent = await checkAndPush(scan(m), day, (k) => k === "insti");
  console.log("法人買超提醒推播", sent, "則");
}
main().catch((e) => { console.error(e); process.exit(1); });
