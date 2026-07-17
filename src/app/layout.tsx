import type { Metadata, Viewport } from "next";
import "./globals.css";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  applicationName: "InventorySync",
  title: {
    default: "InventorySync — Scan, Track, Reorder",
    template: "%s · InventorySync",
  },
  description:
    "Barcode inventory scanning, low-stock reordering, and Google Sheets sync in one app.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "InventorySync",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#171717",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        <CookieConsentBanner />
        <ServiceWorkerRegistrar />
        <SpeedInsights />
      </body>
    </html>
  );
}
