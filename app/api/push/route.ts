// 背景推播的訂閱與規則：轉呼叫 Supabase 的 save_push / delete_push（用公開的 anon key）
const URL_ = process.env.SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_ANON_KEY?.trim();

async function rpc(fn: string, body: unknown) {
  if (!URL_ || !KEY) return Response.json({ error: "伺服器沒有設定 Supabase" }, { status: 503 });
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return Response.json({ error: `Supabase ${r.status}：${(await r.text()).slice(0, 200)}` }, { status: 502 });
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  const { device, sub, rules } = await req.json();
  if (typeof device !== "string" || device.length < 20 || !sub?.endpoint) return Response.json({ error: "參數不對" }, { status: 400 });
  return rpc("save_push", { p_device: device, p_sub: sub, p_rules: rules ?? [] });
}

export async function DELETE(req: Request) {
  const { device } = await req.json();
  if (typeof device !== "string" || device.length < 20) return Response.json({ error: "參數不對" }, { status: 400 });
  return rpc("delete_push", { p_device: device });
}
