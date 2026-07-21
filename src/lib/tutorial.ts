"use client";

import type { TabId } from "@/components/BottomNav";

// The new-customer walkthrough that replaced the old "just some demo items
// nobody explains" first-open experience. Each step names the tab/sidebar
// state it needs and (optionally) a CSS selector to spotlight - see
// TutorialOverlay.tsx for how these get driven and rendered. Kept as a
// flat, ordered list rather than a tree/graph: every customer sees the same
// tour in the same order, so there's nothing branchy to model here.
export interface TutorialStep {
  id: string;
  // Bottom-nav tab this step needs active, or null to leave whatever tab
  // is already showing alone (used for steps about the header/sidebar,
  // which don't care which tab is behind them).
  tab: TabId | null;
  sidebarOpen: boolean;
  // Element to draw the spotlight cutout around, or null for a plain
  // centered card (used for the welcome step, which has nothing to point
  // at yet).
  targetSelector: string | null;
  title: string;
  body: string;
  // Defaults to "Next" - only the final step overrides this, since tapping
  // it there closes the tour rather than moving to another step.
  nextLabel?: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: null,
    title: "Welcome to WS Inventory Management 👋",
    body: "We loaded 3 sample items so there's something to explore right away. This quick tour covers everything the app can do — tap Next to start, or Skip tour if you'd rather dive in on your own.",
  },
  {
    id: "stock-controls",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-stock-controls"]',
    title: "Adjust stock in a tap",
    body: "Tap − or + to log one unit. Press and hold either button to adjust several at once — handy for a big restock or a big pull.",
  },
  {
    id: "scan",
    tab: "scan",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="tab-scan"]',
    title: "Scan barcodes or receipts",
    body: "Point your camera at a barcode to add or remove stock instantly. Adding a whole order at once? Switch to Receipt mode to log several items from one photo.",
  },
  {
    id: "reorder",
    tab: "reorder",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="tab-reorder"]',
    title: "Never run out unexpectedly",
    body: "Reorder automatically lists everything at or below the reorder point you set for it. Tap Share to text or email that list straight to a supplier.",
  },
  {
    id: "usage",
    tab: "usage",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="tab-usage"]',
    title: "See how fast things move",
    body: "Usage charts how quickly each item gets used and estimates how many days of stock are left at that pace — pick any item and any date range.",
  },
  {
    id: "support",
    tab: "support",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="tab-support"]',
    title: "Stuck? We're here",
    body: "Support has a chat you can open any time a question comes up — no need to leave the app.",
  },
  {
    id: "account-gear",
    tab: null,
    sidebarOpen: false,
    targetSelector: '[data-tutorial="account-gear"]',
    title: "Your account lives here",
    body: "The gear icon opens your account: Google Sheets sync, app settings, and billing. Tap it now (or tap Next) to take a look.",
  },
  {
    id: "google-signin",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="google-signin"]',
    title: "Optional: back up to Google Sheets",
    body: "Sign in with Google to sync your inventory to a spreadsheet you own — readable from anywhere, and safe if this device is ever lost. Totally optional; tap Next to skip it for now.",
  },
  {
    id: "start-fresh",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="start-fresh-local"]',
    title: "Ready for the real thing",
    body: 'Tap "Start Fresh" below whenever you’re ready — it clears these 3 sample items so you can start scanning in your actual inventory. Tap Finish tour to close this without clearing anything yet.',
    nextLabel: "Finish tour",
  },
];

// Robust "wait for a DOM node to exist" helper, used to find each step's
// spotlight target after a tab switch or sidebar open triggers a React
// re-render - the node isn't guaranteed to exist in the very same tick a
// step becomes active (switching tabs unmounts/remounts a whole tab's
// component tree). Reuses the same MutationObserver approach proven out
// while testing this app's own live behavior earlier this session: instead
// of fixed-interval polling, react the instant the DOM actually changes,
// with a timeout as a backstop for steps whose target genuinely never
// appears (e.g. Google Sheets isn't configured on this deployment, so the
// "Sign in with Google" button never renders at all - that step should
// give up gracefully rather than hang).
export function waitForElement(selector: string, timeoutMs = 1500): Promise<HTMLElement | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  const existing = document.querySelector<HTMLElement>(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (el: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(el);
    };
    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) finish(el);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => finish(null), timeoutMs);
  });
}
