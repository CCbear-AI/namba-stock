// 整站密碼：密碼放在 Vercel 環境變數 SITE_PASSWORD（沒設就不擋）。
// 登入後 cookie 存的是密碼的雜湊，換密碼後舊 cookie 就對不上 → 所有裝置都要重新輸入。
export const AUTH_COOKIE = "namba_auth";
export const sitePassword = () => process.env.SITE_PASSWORD?.trim() || "";

export async function authToken(pwd: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`namba-stock:${pwd}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 長度固定的字串比對，不因為前幾個字對了就比較快回應 */
export function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
