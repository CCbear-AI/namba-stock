import { AUTH_COOKIE, authToken, sameText, sitePassword } from "@/lib/auth";

const YEAR = 365 * 24 * 3600;
const cookie = (v: string, age: number) => `${AUTH_COOKIE}=${v}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;

// 同一個來源 15 分鐘內錯 10 次就先擋住（存在記憶體，伺服器重開會歸零，只是多一層）
const fails = new Map<string, { n: number; at: number }>();
const WINDOW = 15 * 60_000;

// 登入：密碼對了發一年的 cookie；錯了故意慢一秒，讓人沒辦法快速亂猜
export async function POST(req: Request) {
  const pwd = sitePassword();
  if (!pwd) return Response.json({ ok: true });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "?";
  const f = fails.get(ip);
  if (f && Date.now() - f.at < WINDOW && f.n >= 10) return Response.json({ error: "錯太多次，請 15 分鐘後再試" }, { status: 429 });
  const { password } = (await req.json().catch(() => ({}))) as { password?: unknown };
  const want = await authToken(pwd);
  const got = await authToken(typeof password === "string" ? password.trim() : "");
  if (!sameText(got, want)) {
    const n = f && Date.now() - f.at < WINDOW ? f.n + 1 : 1;
    fails.set(ip, { n, at: n === 1 ? Date.now() : f!.at });
    if (fails.size > 5000) fails.clear();
    await new Promise((r) => setTimeout(r, 1000));
    return Response.json({ error: "密碼不對" }, { status: 401 });
  }
  fails.delete(ip);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie(want, YEAR) } });
}

// 登出：清掉這台裝置的 cookie
export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie("", 0) } });
}
