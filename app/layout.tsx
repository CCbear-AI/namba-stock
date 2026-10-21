import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import AlertWatcher from "@/components/AlertWatcher";

const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });
const sans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "台股難波萬",
  description: "自用台股看盤：大盤、熱力圖、即時資金流、類股 K 線與超級支撐壓力",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
};

export const viewport: Viewport = { themeColor: "#0b0d11", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${mono.variable} ${sans.variable} h-full antialiased`}>
      <head>
        {/* 中文字型：內文 Noto Sans TC、卡片標題 Noto Serif TC（Google Fonts 會依用到的字分段下載） */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@600;700&display=swap" />
      </head>
      <body className="min-h-full flex flex-col">
        <Header />
        <AlertWatcher />
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-4 py-4">{children}</main>
      </body>
    </html>
  );
}
