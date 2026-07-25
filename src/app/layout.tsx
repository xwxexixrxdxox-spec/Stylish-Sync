import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import InstallPromptListener from "@/components/InstallPromptListener";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

// Keep this logic in sync with src/lib/theme.ts by hand - it's a
// standalone copy, not an import, because it has to run and paint before
// any of this app's own JS (or React) has loaded. Without it, every load
// would render light-mode markup first and only flip to dark after
// hydration - a visible flash for anyone who's picked dark (or whose OS
// is set to dark) on every single page load.
const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var pref = localStorage.getItem("isc_theme_v1");
    var dark = pref === "dark" || (pref !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  applicationName: "WS Inventory Management",
  title: {
    default: "WS Inventory Management — Scan, Track, Reorder",
    template: "%s · WS Inventory Management",
  },
  description:
    "Barcode inventory scanning, low-stock reordering, and Google Sheets sync in one app.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WS Inventory Management",
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
  // Two entries rather than one flat value: the OS/browser picks whichever
  // matches its own current color scheme for things it paints itself (the
  // PWA status bar, the browser's own UI chrome around the page) - this is
  // separate from, and doesn't know about, the in-app ThemeToggle override,
  // so a manual override inside the app won't repaint this chrome. Good
  // enough for a "nice to have" - the two only really diverge for someone
  // who's deliberately overridden the in-app theme away from their OS
  // setting, which is a narrow, low-stakes case here (a mismatched status
  // bar color, nothing broken).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is scoped to this one element only (it
    // doesn't cascade to children) and is the standard fix for exactly this
    // situation: the inline bootstrap script above adds/removes the "dark"
    // class on <html> before React hydrates, which otherwise makes React
    // log a spurious "server/client HTML mismatch" warning on every load
    // even though nothing is actually wrong.
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        {children}
        <CookieConsentBanner />
        <GoogleAnalytics />
        <ServiceWorkerRegistrar />
        <InstallPromptListener />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
