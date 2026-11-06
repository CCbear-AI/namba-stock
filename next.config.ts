import type { NextConfig } from "next";
import { dataTracing } from "./data-includes.mjs";

const tracing = dataTracing();

const nextConfig: NextConfig = {
  // 安全標頭：不准別的網站把這裡嵌進 iframe（防騙點擊）、不猜檔案類型、外連只帶網域
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  // API 會讀 data/ 底下的 JSON，部署時要一起打包；每支 API 只帶自己用到的（見 data-includes.mjs）
  outputFileTracingIncludes: tracing.includes,
  outputFileTracingExcludes: tracing.excludes,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
