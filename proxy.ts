// 整站密碼門：沒登入的頁面導到 /login，API 回 401（SITE_PASSWORD 沒設就全部放行）
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken, sameText, sitePassword } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const pwd = sitePassword();
  if (!pwd) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  const got = req.cookies.get(AUTH_COOKIE)?.value ?? "";
  if (got && sameText(got, await authToken(pwd))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // 靜態檔、圖示、PWA 設定與推播 service worker 不擋
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|manifest.webmanifest|sw.js|.*\.(?:svg|png|jpg|ico|webp|woff2?)$).*)"],
};
