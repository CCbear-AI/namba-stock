// 刪 Vercel 舊部署：最新 KEEP 版 READY 留著，建置中的不動，其餘刪
// env：VERCEL_TOKEN、TEAM、PROJECT、KEEP（預設 5）、DRY_RUN=true 只列出
const { VERCEL_TOKEN, TEAM, PROJECT } = process.env;
const KEEP = Number(process.env.KEEP || 5);
const DRY = process.env.DRY_RUN === "true";
if (!VERCEL_TOKEN) { console.error("::error::沒設 VERCEL_TOKEN secret"); process.exit(1); }

const api = async (url, method = "GET") => {
  const r = await fetch(`https://api.vercel.com${url}`, { method, headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } });
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${await r.text()}`);
  return r.json();
};

const all = new Map();
let until = "";
for (let page = 0; page < 20; page++) {
  const r = await api(`/v6/deployments?projectId=${PROJECT}&teamId=${TEAM}&limit=100${until ? `&until=${until}` : ""}`);
  for (const d of r.deployments) all.set(d.uid, d);
  until = r.pagination?.next;
  if (!until) break;
}

const sorted = [...all.values()].sort((a, b) => b.created - a.created);
const keep = new Set(sorted.filter((d) => d.state === "READY").slice(0, KEEP).map((d) => d.uid));
const busy = ["BUILDING", "QUEUED", "INITIALIZING"];
const del = sorted.filter((d) => !keep.has(d.uid) && !busy.includes(d.state));
console.log(`共 ${sorted.length} 版，留最新 ${keep.size} 版 READY，要刪 ${del.length} 版`);
if (DRY) { for (const d of del) console.log(`(不刪) ${d.uid} ${d.state} ${new Date(d.created).toISOString()}`); }
else {
let fail = 0;
for (const d of del) {
  try { await api(`/v13/deployments/${d.uid}?teamId=${TEAM}`, "DELETE"); console.log(`已刪 ${d.uid}`); }
  catch (e) { fail++; console.log(`刪除失敗 ${d.uid}：${e.message}`); }
}
console.log(`完成，失敗 ${fail} 筆`);
if (fail) process.exitCode = 1;
}
