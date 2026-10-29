"use client";
// 登入頁不顯示頂部導覽和背景提醒（沒登入時它們抓 API 只會拿到 401）
import { usePathname } from "next/navigation";

export default function HideOnLogin({ children }: { children: React.ReactNode }) {
  return usePathname() === "/login" ? null : <>{children}</>;
}
