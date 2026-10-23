import fs from "node:fs";
import path from "node:path";

// 最新一份盤後 AI 摘要（scripts/ai-summary.ts 產生的 data/summary/日期.json）
export async function GET() {
  const dir = path.join(process.cwd(), "data", "summary");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
  if (!files.length) return Response.json({ error: "還沒有盤後摘要" }, { status: 404 });
  const s = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8"));
  delete s.facts; // 給 AI 的原始數字不用傳到前端
  return Response.json(s);
}
