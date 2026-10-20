import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API 會讀 data/ 底下的 JSON（類股歷史、資金流紀錄），部署時要一起打包
  outputFileTracingIncludes: {
    "/api/**": ["./data/**/*"],
  },
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
