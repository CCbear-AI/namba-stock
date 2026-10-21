import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import AlertWatcher from "@/components/AlertWatcher";

const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "台股難波萬",
  description: "自用台股看盤：大盤、熱力圖、即時資金流、類股 K 線與超級支撐壓力",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
};

export const viewport: Viewport = { themeColor: "#0b0c0e", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Header />
        <AlertWatcher />
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-4 py-4">{children}</main>
      </body>
    </html>
  );
}
