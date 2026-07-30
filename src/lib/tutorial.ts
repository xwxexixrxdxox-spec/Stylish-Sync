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
  // A second spotlight target this one step switches to partway through -
  // used by "reorder", which starts by pointing at a real low-stock item's
  // warning text (concrete: "here's an item that needs attention") and
  // switches to the "Find at" button once the narration has moved on to
  // talking about sourcing it. TutorialOverlay switches the moment the
  // step's own audio clip crosses the halfway mark (audio.currentTime >=
  // duration/2), or after phase2FallbackMs if voice is muted and there's no
  // clip playing to key off of.
  targetSelectorPhase2?: string;
  phase2FallbackMs?: number;
  // Other elements that stay in sharp focus (excluded from the blur mask)
  // for this step's entire duration, in addition to whatever the glow
  // itself is currently pointing at (targetSelector, then
  // targetSelectorPhase2). Use this for controls that are relevant context
  // for the step but that the narration never actually names - e.g.
  // "reorder" keeps the whole item card and the search-by toggle visible
  // and interactive throughout, even though the glow itself only ever
  // visits the low-stock text and the Share button, the two things the
  // narration actually mentions by name.
  focusSelectors?: string[];
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
  // Sits right after the welcome step so the consent banner gets resolved
  // before the tour starts pointing at the bottom nav — the banner renders
  // at z-50, above the nav's z-30, so until the customer chooses, it
  // physically covers the very tabs steps 4-7 spotlight. TutorialOverlay
  // filters this step out entirely when consent was already given (e.g. a
  // replayed tour), and auto-advances it the moment a choice is made.
  {
    id: "cookie-consent",
    tab: null,
    sidebarOpen: false,
    targetSelector: '[data-tutorial="cookie-banner"]',
    title: "First, a quick choice",
    body: "Pick Accept or Decline below — either is fine, the app only uses essential cookies. Choosing now also clears this banner out of the way for the rest of the tour.",
  },
  // Split from a single "stock-controls" step into two, each waiting for
  // the real gesture it's describing before moving on, rather than reading
  // both instructions aloud back-to-back while the customer just watches.
  // See TutorialOverlay.tsx's stock-controls effect: it self-resolves off
  // data-tutorial-burst-count/-phase attributes ItemCard already reflects
  // from its own real press/hold state, for the one item this tour points
  // at (InventoryTab passes tutorialTarget only to the first item).
  {
    id: "stock-controls-tap",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-stock-controls"]',
    title: "Adjust stock in a tap",
    body: "Go ahead and tap − or + on this item to log one unit.",
  },
  {
    id: "stock-controls-hold",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-stock-controls"]',
    title: "Hold for bigger changes",
    body: "Now try pressing and holding either button — that adjusts several at once, handy for a big restock or a big pull.",
  },
  {
    id: "scan",
    tab: "scan",
    sidebarOpen: false,
    // Points at the real blue "Scan Barcode" button rather than the
    // bottom-nav tab icon that got you here — the tab icon is where you
    // came from, not what this step is actually about. Self-resolves once
    // a real scan produces a lookup response (see TutorialOverlay.tsx's
    // scan effect, keyed off data-tutorial-lookup-status on the scan
    // panel) — Next still works too, for a customer with nothing on hand
    // to scan right now.
    targetSelector: '[data-tutorial="scan-action-area"]',
    title: "Scan barcodes or receipts",
    body: "Point your camera at a barcode to add or remove stock instantly. Adding a whole order at once? Switch to Receipt mode to log several items from one photo.",
  },
  {
    id: "reorder",
    tab: "reorder",
    sidebarOpen: false,
    // Starts on the concrete "why" - a real low-stock item's red warning
    // text - then switches to the Share button partway through the
    // narration; see targetSelectorPhase2 above. (This used to switch to
    // the "Find at" button instead, which doesn't match what the narration
    // actually says in its second half - a mismatch the customer caught by
    // screenshotting the live glow next to the step's own body text. Find
    // at stays visible and interactive via focusSelectors below; it just
    // isn't what the glow itself visits, since the voice never names it.)
    targetSelector: '[data-tutorial="reorder-low-stock-text"]',
    targetSelectorPhase2: '[data-tutorial="reorder-share-button"]',
    phase2FallbackMs: 4200,
    // The rest of this step's relevant UI - the search-by toggle and the
    // whole item card (which already contains the low-stock text, Find at,
    // and Add tracking number) - stays sharp and clickable the entire step,
    // even during the phase where the glow itself has moved on to Share.
    focusSelectors: [
      '[data-tutorial="reorder-search-by-toggle"]',
      '[data-tutorial="reorder-item-card"]',
    ],
    title: "Never run out unexpectedly",
    body: "Reorder automatically lists everything at or below the reorder point you set for it. Tap Share to text or email that list straight to a supplier.",
  },
  {
    id: "usage",
    tab: "usage",
    sidebarOpen: false,
    // The real usage list, not the bottom-nav tab icon - there's nothing
    // to see by pointing at the icon you just tapped to get here.
    targetSelector: '[data-tutorial="usage-overview-list"]',
    title: "See how fast things move",
    body: "Usage charts how quickly each item gets used and estimates how many days of stock are left at that pace — pick any item and any date range.",
  },
  {
    id: "support",
    tab: "support",
    sidebarOpen: false,
    // The real chat widget, not the bottom-nav tab icon - the spotlight's
    // cutout leaves the chat's real input/messages fully clickable/typable
    // during this step, so a customer can actually try it while the card
    // is still up rather than just being shown where the tab lives.
    targetSelector: '[data-tutorial="support-chat"]',
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
