"use client";

import type { TabId } from "@/components/BottomNav";

// The new-customer walkthrough that replaced the old "just some demo items
// nobody explains" first-open experience. Each step names the tab/sidebar
// state it needs and (optionally) a CSS selector to spotlight - see
// TutorialOverlay.tsx for how these get driven and rendered. Kept as a
// flat, ordered list rather than a tree/graph: every customer sees the same
// tour in the same order, so there's nothing branchy to model here.
//
// Fourth-generation content (round "O"): a full rewrite from the
// customer's own step-by-step "Tutorial Guide" doc, on top of the
// third-generation engine changes shipped alongside it (draggable HUD,
// back arrow, no more auto-advance-on-audio-end - see TutorialOverlay.tsx's
// top comment). The doc covers what it calls "Part 1" and "Part 2" of the
// tour - both folded into this one TUTORIAL_STEPS list, since Part 2 (the
// Account section: menu, Google Sheets push/pull, Start Fresh) is still
// the same single continuous walkthrough as Part 1, just its back half.
// "Part 3" (a from-scratch, hands-on rework of the Property tour) is a
// separate, larger undertaking not included in this round - see
// propertyTutorial.ts's own comment.
export interface TutorialStep {
  id: string;
  // Which section of the tour this step belongs to, shown in the HUD as
  // e.g. "Inventory 3/9". A bare "1/32" was the first thing a customer read
  // on the opening step, and thirty-two is a daunting number to lead with -
  // a chapter shows them the end of the section they're actually in.
  // TutorialOverlay counts positions over the steps that survived its
  // narration preflight, so these stay correct even when steps get dropped.
  chapter?: string;
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
  // Overrides the HUD's plain chevron with a bigger, explicitly-labeled
  // pill button showing this text - used for the stock-stepper pair, whose
  // whole point is "try tapping and holding as many times as you want, on
  // your own schedule, then tell us when you're ready" rather than moving
  // on the instant a single gesture is detected (the old behavior, and a
  // direct customer complaint - see TutorialOverlay.tsx's top comment).
  moveOnLabel?: string;
  // Shows the floating blue voice waveform panel while narration is
  // playing on this step. Exactly one step in this tour sets it - the
  // welcome, which is the only step with no spotlight target at all, so
  // it's the only place where the customer would otherwise be hearing a
  // voice come out of a page that looks completely idle. The field name
  // predates the panel (it drove a small in-HUD bar chip before); kept as
  // is so the property tour's matching field reads the same. See
  // TutorialVoiceWave.tsx.
  showSoundBar?: boolean;
  // A second spotlight target this one step switches to partway through -
  // TutorialOverlay switches the moment the step's own audio clip crosses
  // the halfway mark (audio.currentTime >= duration/2), or after
  // phase2FallbackMs if voice is muted and there's no clip playing to key
  // off of.
  targetSelectorPhase2?: string;
  phase2FallbackMs?: number;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    chapter: "Getting started",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: null,
    showSoundBar: true,
    title: "Welcome to WS Inventory Management 👋",
    body: "We loaded 3 sample items so there's something to explore right away. This quick tour covers everything the app can do — tap the arrow to move through it at your own pace, or Skip tour if you'd rather dive in on your own.",
  },
  // Sits right after the welcome step so the consent banner gets resolved
  // before the tour starts pointing at the bottom nav — the banner renders
  // at z-50, above the nav's z-30, so until the customer chooses, it
  // physically covers the very tabs later steps spotlight. TutorialOverlay
  // filters this step out entirely when consent was already given (e.g. a
  // replayed tour), and auto-advances it the moment a choice is made - the
  // one narrative-content step still allowed to move on by itself, since
  // there's nothing to narrate here that a "Next" tap would add to.
  {
    id: "cookie-consent",
    chapter: "Getting started",
    tab: null,
    sidebarOpen: false,
    targetSelector: '[data-tutorial="cookie-banner"]',
    title: "First, a quick choice",
    body: "Pick Accept or Decline below — either is fine, the app only uses essential cookies. Choosing now also clears this banner out of the way for the rest of the tour.",
  },
  {
    id: "header-theme-toggle",
    chapter: "Getting started",
    tab: null,
    sidebarOpen: false,
    targetSelector: '[data-tutorial="header-theme-toggle"]',
    title: "Light or dark, any time",
    body: "This flips the whole app between light and dark mode whenever you like — it sticks until you tap it again.",
  },
  // Split out from the old combined "header-tools" step into its own, so
  // the customer can actually try the hold gesture rather than just being
  // told about it - see ClearCacheButton.tsx's tutorialDud prop, which
  // this step relies on to make that safe: the full hold-and-reveal
  // animation plays out exactly like the real thing, but nothing is
  // actually cleared while the tutorial is open.
  {
    id: "header-clear-cache-test",
    chapter: "Getting started",
    tab: null,
    sidebarOpen: false,
    targetSelector: '[data-tutorial="header-clear-cache"]',
    title: "Try the refresh button — safely",
    body: "Next to it, this icon reloads the app fresh if something ever looks stuck. Go ahead and press and hold it right now — it's just a preview while this tour is open, so nothing will actually be cleared. In real use, holding it for real does wipe this device's local cache and reload the page, though it never touches your saved inventory data.",
  },
  // Split from a single "stock-controls" step into two, each waiting for
  // the customer to explicitly move on (moveOnLabel below) rather than
  // reading both instructions aloud back-to-back or jumping ahead the
  // instant one gesture is detected — a direct fix for "it moves on too
  // quickly after just a single tap." The customer can tap and hold as
  // many times as they want on their own schedule before choosing Move on.
  //
  // Both spotlight the − button itself rather than the whole quantity row:
  // the row is about 470px wide while the two buttons the narration actually
  // names are barely 30px each, so a customer heard "tap minus or plus" and
  // was shown a strip covering half the card. The + button and the quantity
  // chip especially matters here, since watching that number change is the
  // whole feedback loop these two steps teach - and now that nothing on the
  // page is dimmed, it is plainly visible right next to the glowing button.
  {
    id: "stock-controls-tap",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-stock-decrement"]',
    moveOnLabel: "Move on",
    title: "Adjust stock in a tap",
    body: "Go ahead and tap − or + on this item to log a unit at a time. Try it as many times as you like.",
  },
  {
    id: "stock-controls-hold",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-stock-decrement"]',
    moveOnLabel: "Move on",
    title: "Hold for bigger changes",
    body: "Now try pressing and holding either button — that adjusts several at once, handy for a big restock or a big pull. Take your time; tap Move on whenever you're ready to keep going.",
  },
  {
    id: "inventory-search-sort",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="inventory-search"]',
    targetSelectorPhase2: '[data-tutorial="inventory-sort"]',
    phase2FallbackMs: 4000,
    title: "Find anything fast",
    body: "Search by name, barcode, or location. Next to it, the sort menu can bump low-stock items straight to the top of the list.",
  },
  {
    id: "inventory-import-export",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="inventory-import-export"]',
    title: "Bring in — or back up — a whole spreadsheet",
    body: "Already track inventory in a spreadsheet? Import it here in one go. Export works the same way in reverse, any time you want a copy on hand.",
  },
  {
    id: "inventory-share-barcodes",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="inventory-share-barcodes"]',
    title: "Sharing is caring",
    body: "Send your saved barcode-to-item matches to a teammate, or pull in theirs — handy the first time you're both starting from scratch, so neither of you has to scan everything twice.",
  },
  // Trimmed down from the old combined step: the quantity-chip explanation
  // that used to open this step is gone, and what's left is a brief
  // overview before three dedicated steps below let the customer try each
  // icon themselves.
  {
    id: "item-action-icons",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-action-icons"]',
    title: "A closer look at these icons",
    body: "Over on the right, the icons cover breaking down a case, moving stock to another location, editing details, and deleting. Give each one a try, one at a time.",
  },
  {
    id: "item-action-breakdown",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-action-breakdown"]',
    title: "Break down a case",
    body: "Tap this icon to split a sealed case into individual units — handy the moment a case actually gets opened, so the count stays accurate at both levels.",
  },
  {
    id: "item-action-edit",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-action-edit"]',
    title: "Edit the full details",
    body: "The pencil opens this item's full details — name, barcode, reorder point, usage tracking window, and more.",
  },
  {
    id: "item-action-delete",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-action-delete"]',
    title: "Delete for good",
    body: "And the trash icon removes an item entirely — it'll always ask you to confirm first, so there's no risk of an accidental tap losing anything.",
  },
  {
    id: "scan",
    chapter: "Scan",
    tab: "scan",
    sidebarOpen: false,
    // Points at the real blue "Scan Barcode" button rather than the
    // bottom-nav tab icon that got you here. Self-resolves once a real
    // scan produces a lookup response (see TutorialOverlay.tsx's scan
    // effect) — the manual Next in the corner HUD still works too, for a
    // customer with nothing on hand to scan right now.
    targetSelector: '[data-tutorial="scan-action-area"]',
    title: "Scan barcodes or receipts",
    body: "Point your camera at a barcode to add or remove stock instantly. Adding a whole order at once? Switch to Receipt mode to log several items from one photo.",
  },
  {
    id: "scan-modes",
    chapter: "Scan",
    tab: "scan",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="scan-mode-toggle"]',
    title: "Two ways to log stock",
    body: "Barcode mode is for one item at a time. Receipt mode reads a whole photographed receipt at once — great right after a big supply run, though accuracy can be hit or miss on a crumpled or blurry receipt. Worth a quick double-check of the results before trusting them completely.",
  },
  // Rebuilt from a single combined step into four narrower ones (this one,
  // then search-and-find, then package tracking, then a dedicated share
  // step) so each idea gets its own moment instead of being read back to
  // back over one narration clip. This step used to ask for a few seconds
  // with the dim suppressed so the customer could see the real reorder list
  // plainly; that is now how every step behaves, so the field is gone.
  {
    id: "reorder",
    chapter: "Reorder",
    tab: "reorder",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="reorder-low-stock-text"]',
    title: "Never run out unexpectedly",
    body: "This is Reorder — it automatically lists everything at or below the reorder point you've set for it. Take a look at this item; its low-stock warning is right here.",
  },
  {
    id: "reorder-search-and-find",
    chapter: "Reorder",
    tab: "reorder",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="reorder-search-by-toggle"]',
    targetSelectorPhase2: '[data-tutorial="reorder-find-at-button"]',
    phase2FallbackMs: 4200,
    title: "Choose how it searches, then where to buy",
    body: "This toggle controls whether Find at searches by barcode or by name, and Find at itself jumps straight to a search on a few common retailer sites. Give both a try — no rush, take whatever time you need.",
  },
  // Moved ahead of the new dedicated share step per the customer's own
  // reordering.
  {
    id: "reorder-package-tracking",
    chapter: "Reorder",
    tab: "reorder",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="reorder-package-tracking"]',
    title: "Jot down a tracking number",
    body: "Once you've ordered, save the tracking number here for a quick link to the carrier's tracking page. It's simple by design — just a place to keep the number handy, not a live delivery tracker.",
  },
  {
    id: "reorder-share",
    chapter: "Reorder",
    tab: "reorder",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="reorder-share-button"]',
    title: "Send the whole list to a supplier",
    body: "Tap Share to text or email this entire reorder list straight to a supplier — everything currently at or below its reorder point, in one go.",
  },
  // Rebuilt: narrows the overview list to just this one item (see
  // UsageOverview.tsx's tutorialFocusItemId) so the customer isn't hunting
  // through a whole list, then self-resolves the moment they actually tap
  // into it (see TutorialOverlay.tsx's usage effect) — real exploration is
  // the point of this step, not narration to sit through.
  {
    id: "usage",
    chapter: "Usage",
    tab: "usage",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="usage-overview-list"]',
    title: "See how fast things move",
    body: "Usage charts how quickly each item gets used and estimates how many days of stock are left at that pace. We've narrowed the list to just this one item for now — go ahead and tap into it to see its full detail view.",
  },
  {
    id: "usage-detail-timeframes",
    chapter: "Usage",
    tab: "usage",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="usage-timeframe-buttons"]',
    title: "Zoom in or out on any time frame",
    body: "These buttons switch the chart between a week, a month, a few months, or all-time — the fastest way to tell a one-off spike apart from a real ongoing trend.",
  },
  {
    id: "support",
    chapter: "Support",
    tab: "support",
    sidebarOpen: false,
    // The real chat widget, not the bottom-nav tab icon - the spotlight's
    // cutout leaves the chat's real input/messages fully clickable/typable
    // during this step, so a customer can actually try it while pointed
    // at it.
    targetSelector: '[data-tutorial="support-chat"]',
    title: "Stuck? Clyde's here",
    body: "Support has Clyde, a free AI assistant you can open any time a question comes up — no need to leave the app. It remembers what you've told it earlier in the same conversation, so you don't have to repeat yourself as you dig into an issue.",
  },
  {
    id: "account-gear",
    chapter: "Account",
    tab: null,
    sidebarOpen: false,
    targetSelector: '[data-tutorial="account-gear"]',
    title: "Your account lives here",
    body: "The gear icon opens your account: Google Sheets sync, app settings, and billing. Tap it now (or tap Next) to take a look.",
  },
  {
    id: "google-signin",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="google-signin"]',
    // This step used to set showSoundBar too. It doesn't any more: the
    // customer scoped the waveform to "only the welcome step of the
    // inventory page and the welcome step of the property page." Here the
    // amber glow is already on a real button, so a second animated element
    // was competing with the thing the narration is telling them to look
    // at.
    title: "Optional: back up to Google Sheets",
    body: "Sign in with Google to sync your inventory to a spreadsheet you own — readable from anywhere, and safe if this device is ever lost. Totally optional; tap Next to skip it for now, and the next few steps will just gracefully skip past anything that needs a connected sheet.",
  },
  // The next three steps (push, Start Fresh, pull) are a deliberate
  // sequence per the customer's own doc: push this device's current
  // inventory up, clear it locally, then pull it back down — a genuine
  // round trip that demonstrates why Google Sheets sync exists, not just
  // what the buttons do. All three gracefully do nothing but sit there if
  // Google Sheets was skipped above — see AccountTab.tsx's existing
  // conditional rendering, unchanged this round.
  {
    id: "account-push-test",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-push-button"]',
    title: "Push sends this device's copy up",
    body: "If you connected Google Sheets a moment ago, go ahead and tap Push to Sheet now — it sends this device's current inventory up to your spreadsheet. Nothing syncs automatically; it only happens when you tap it.",
  },
  {
    id: "account-name-tag",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-name-tag"]',
    title: "Put a name on your changes",
    body: "Add your name here so teammates working the same inventory can see who made a change and when — just a label, not a login, and anyone on this device can update it.",
  },
  {
    id: "start-fresh",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="start-fresh-local"]',
    title: "Clear this device's copy",
    body: "Tap Start Fresh below whenever you're ready — it clears these sample items and any changes you've made so far, right here on this device. If you pushed to a connected sheet a moment ago, nothing there is touched; the next step brings it right back.",
  },
  {
    id: "account-pull-test",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-pull-button"]',
    title: "Pull brings it back down",
    body: "And if you pushed earlier, tap Pull from Sheet now to bring that same inventory right back — proof that your data really does live safely in the spreadsheet, not just on this one device.",
  },
  {
    id: "account-manage-property",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-manage-property"]',
    title: "Track equipment, not just stock",
    body: "Property is a separate space for tracking equipment and fixtures — ordered parts, maintenance status, all of it — synced to its own tab on the same spreadsheet.",
  },
  {
    id: "account-reminders-install",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-reminders-toggle"]',
    targetSelectorPhase2: '[data-tutorial="account-install-app"]',
    phase2FallbackMs: 4200,
    title: "Reminders, and a home-screen shortcut",
    body: "Turn on daily reminders and you'll only hear from us when something's actually worth checking. And if you'd like this app to feel less like a browser tab, you can install it right to your home screen from here.",
  },
  {
    id: "account-replay-tour",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-replay-tour"]',
    title: "Come back to this tour any time",
    body: "This link brings this exact walkthrough back whenever you want a refresher — it's the only way to see it again now, since it no longer opens automatically.",
  },
  {
    id: "tour-complete",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    // Deliberately targetless. This used to spotlight "Manage Property" -
    // the exact same control step 29 already points at - so the closing
    // line landed on a button the customer had just been taught, which
    // read like the tour had lost its place. A goodbye isn't attached to a
    // control, so with a null target no glow is drawn at all - just the
    // HUD over the live app, which is the right note to end on.
    targetSelector: null,
    title: "That's the tour!",
    body: "You're all set — explore Inventory on your own from here, or tap Manage Property above to keep going with equipment tracking.",
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
