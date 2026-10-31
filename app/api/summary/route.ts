import fs from "node:fs";
import path from "node:path";

// 最新一份盤後 AI 摘要（scripts/ai-summary.ts 產生的 data/summary/日期.json）
// ?kind=report：分點晚報（scripts/broker-report.ts 產生的 data/report/日期.json）
// ?kind=world：早上國際焦點（scripts/world-focus.ts 產生的 data/world/日期.json）
const KINDS: Record<string, [string, string]> = { summary: ["summary", "還沒有盤後摘要"], report: ["report", "還沒有分點晚報"], world: ["world", "還沒有國際焦點"] };

export async function GET(req: Request) {
  const [sub, empty] = KINDS[new URL(req.url).searchParams.get("kind") ?? ""] ?? KINDS.summary;
  const dir = path.join(process.cwd(), "data", sub);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
  if (!files.length) return Response.json({ error: empty }, { status: 404 });
  const s = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8"));
  delete s.facts; // 給 AI 的原始數字不用傳到前端
  return Response.json(s);
}
