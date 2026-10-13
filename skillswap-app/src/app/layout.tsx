import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaClient } from "./pwa-client";
import { BackButton } from "@/components/back-button";

export const metadata: Metadata = {
  applicationName: "SkillSwap",
  title: "SkillSwap — Your skills are currency",
  description: "A place to share what you know and learn what you need.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/skillswap-symbol.png", type: "image/png" },
      { url: "/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "SkillSwap",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f8176",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <BackButton />
        <PwaClient />
      </body>
    </html>
  );
}
