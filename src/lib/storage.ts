"use client";

import { InventoryItem, StockMovement, PackageTracking, PropertyItem } from "./types";

// Local-first storage: the app works fully offline using localStorage as
// the always-available cache, with Google Sheets as an optional
// two-way sync layer on top (see googleSheets.ts). This mirrors both
// source apps: Base44's app worked without any account, and the ISC app
// treated the Google Sheet as the durable copy while still functioning
// off the local form state.

const ITEMS_KEY = "isc_inventory_items_v1";
const SHEET_LINK_KEY = "isc_google_sheet_id_v1";
const COOKIE_CONSENT_KEY = "isc_cookie_consent_v1";
const MOVEMENTS_KEY = "isc_stock_movements_v1";
const INVENTORY_SORT_KEY = "isc_inventory_sort_v1";
// Whether the new-customer walkthrough (TutorialOverlay.tsx) has already
// run its course - present (any value) once the customer has finished or
// explicitly skipped it, missing otherwise. Kept separate from ITEMS_KEY's
// own "brand new install" signal (see isFreshInstall below) rather than
// derived from it, so a customer who clears their cache and gets reseeded
// demo items also genuinely gets the tour again - see clearAppCache.
const TUTORIAL_KEY = "isc_tutorial_completed_v1";
// Whether the first-visit "New here? Take the tour" chip has been waved
// off. See getTourInviteDismissed for why this is separate from
// TUTORIAL_KEY above.
const TOUR_INVITE_DISMISSED_KEY = "isc_tour_invite_dismissed_v1";
// Whether the customer has dismissed the "Install app" banner (the
// closeable pop-up on the main screen). Present once dismissed, missing
// otherwise — so the banner nags at most until the first dismissal, then
// stays out of the way. The Account panel still has an always-available
// install entry point regardless.
const INSTALL_BANNER_DISMISSED_KEY = "isc_install_banner_dismissed_v1";
// Whether the customer has closed the "Coming Soon" overlay on the Live
// In-Store Setup card in the Account panel (see LiveInStoreCard.tsx). Present
// once dismissed, missing otherwise — same on/off-until-closed shape as the
// install banner above. Deliberately NOT re-checked against VISITS_ENABLED
// here (that's a deploy-time constant the component itself reads) — once an
// admin actually turns the feature on, the card stops being gated on this
// flag at all and just renders live, so a stale dismissal from the
// "coming soon" era never hides the real, working feature.
const LIVE_INSTORE_DISMISSED_KEY = "isc_live_instore_dismissed_v1";
// Same "closeable Coming Soon overlay" pattern as LIVE_INSTORE_DISMISSED_KEY
// above, but for the actual /book_appointment page (BookAppointmentPage) -
// while VISITS_ENABLED is off, that page shows the real (inert) booking
// mechanism behind a translucent, dismissible notice rather than blocking
// the whole page with an opaque "paused" message. Same reasoning applies:
// deliberately NOT re-checked against VISITS_ENABLED here, since the page
// itself stops rendering any overlay at all once the flag flips on,
// regardless of a stale dismissal from the "coming soon" era.
const BOOKING_PAUSED_DISMISSED_KEY = "isc_booking_paused_dismissed_v1";
// A lightweight, per-device "who's using this thing" name tag — see the
// `lastEditedBy` comment on InventoryItem in types.ts for what this is and
// (importantly) isn't. Missing means nobody's set one on this device yet.
const EDITOR_NAME_KEY = "isc_editor_name_v1";
// Which field the Reorder tab's "Find at" retailer links search by — see
// ReorderTab.tsx and retailerSearch.ts. Missing (the default) means "auto":
// barcode when the item has one, otherwise name — the same fallback the
// original Amazon-only link always used, so this ships without changing
// anyone's current results until they explicitly pick one.
const RETAILER_SEARCH_BY_KEY = "isc_retailer_search_by_v1";
// Caps how much movement history we keep in localStorage. The Usage tab's
// date filter now goes up to "All time," so this needs to comfortably
// cover several years of realistic activity rather than "well over a
// year" — bumped from 2000 to 20000 (roughly 2MB of JSON at typical entry
// size), which stays safely under the ~5-10MB per-origin quota most
// browsers give localStorage. An extremely high-volume, many-years-active
// customer could still eventually roll off the oldest entries; there's no
// way around that without moving history off localStorage entirely.
const MAX_MOVEMENTS = 20000;

// The three demo items a brand-new device starts with. The count is pinned
// at three because the tour's opening narration says so out loud ("we
// loaded 3 sample items") — changing it would silently make a recorded
// clip wrong.
//
// They're deliberately not three unrelated products any more. Two of the
// three (seed-1 and seed-3) are the same product at two levels — sealed
// cases in dry storage, loose bottles in the cooler — linked by
// breaksDownIntoBarcode. That relationship is what makes the break-down
// feature visible at all: ItemCard only renders the break-down icon for an
// item that actually has an each-level counterpart, so before this the
// tour's "break down a case" step pointed at a control that didn't exist
// on any sample item and simply had nothing to show.
//
// Order matters twice over. The inventory list defaults to "Recently
// changed", and the tour only ever targets the first card, so seed-1
// carries the newest updatedAt and is the case (parent) side — its child
// renders indented beneath it via groupBreakDownChildren. The Usage step
// likewise focuses items[0], which is this same item.
const SEED_NOW = Date.now();
const DAY_MS = 86_400_000;
const seedDaysAgo = (days: number, hours = 0) =>
  new Date(SEED_NOW - days * DAY_MS - hours * 3_600_000).toISOString();

const SEED_ITEMS: InventoryItem[] = [
  {
    id: "seed-1",
    barcode: "8412345678905",
    name: "Spring Water 500ml — Case of 24",
    quantity: 6,
    unit: "case",
    pricePerUnit: 11.5,
    reorderAt: 3,
    updatedAt: seedDaysAgo(0),
    location: "Dry Stock",
    breaksDownIntoBarcode: "8412345678929",
    breaksDownIntoQty: 24,
  },
  {
    id: "seed-2",
    barcode: "8412345678912",
    name: "Ballpoint Pens (blue)",
    quantity: 3,
    unit: "pack",
    pricePerUnit: 2.0,
    reorderAt: 4,
    updatedAt: seedDaysAgo(0, 6),
    location: "Dry Stock",
  },
  {
    id: "seed-3",
    barcode: "8412345678929",
    name: "Spring Water 500ml",
    quantity: 48,
    unit: "bottle",
    pricePerUnit: 0.75,
    reorderAt: 12,
    updatedAt: seedDaysAgo(1),
    location: "Cooler",
  },
];

// Six weeks of plausible history for the three demo items above, written
// once alongside them on a brand-new device.
//
// The reason this exists: the Usage tab charts consumption from the
// movement log, and a freshly-seeded device had an empty log — so the tour
// step that promises "see how fast things move, and how many days of stock
// you have left" spotlighted a card reading "No usage last 30d." The tour's
// own example disproved its own pitch. Synthetic history is the honest fix:
// it's demo data on demo items, and Start Fresh clears it exactly the same
// way it clears the demo items themselves.
//
// The arithmetic is deliberately closed: starting from zero, every item's
// deltas sum to exactly the quantity it's seeded with. A history that
// contradicts the number printed on the card would be worse than no
// history at all.
//   seed-1: 3 deliveries x 12 = +36, one case opened per open day = -30 -> 6
//   seed-3: 30 breakdowns x 24 = +720, six weeks of the cycle below = -672 -> 48
//   seed-2: one +6 restock, three -1 pulls                                -> 3
// The window is exactly six 7-day weeks, and the site is "closed" two days
// a week (no cases opened, no bottles consumed), which is both realistic
// and what makes those totals land on whole numbers. Breaking a case is
// logged on both sides (see StockMovement.reason), so seed-1's and seed-3's
// histories are two halves of the same events — meaning the Usage tab ends
// up demonstrating the case/each relationship too, not just a line sloping
// down.
const SEED_WINDOW_DAYS = 42;
// Bottles consumed by day-of-cycle. The two zeroes are the closed days.
const SEED_BOTTLE_CYCLE = [0, 0, 24, 22, 24, 20, 22];
const SEED_DELIVERY_DAYS = new Set([40, 26, 12]);

function buildSeedMovements(): Omit<StockMovement, "id">[] {
  const entries: Omit<StockMovement, "id">[] = [];

  for (let d = SEED_WINDOW_DAYS - 1; d >= 0; d--) {
    const consumed = SEED_BOTTLE_CYCLE[d % 7];
    const open = consumed > 0;
    if (SEED_DELIVERY_DAYS.has(d)) {
      entries.push({ itemId: "seed-1", delta: 12, reason: "scan-add", at: seedDaysAgo(d, 9) });
    }
    if (open) {
      entries.push({ itemId: "seed-1", delta: -1, reason: "break-case", at: seedDaysAgo(d, 7) });
      entries.push({ itemId: "seed-3", delta: 24, reason: "break-case", at: seedDaysAgo(d, 7) });
      entries.push({ itemId: "seed-3", delta: -consumed, reason: "scan-remove", at: seedDaysAgo(d, 2) });
    }
  }

  entries.push({ itemId: "seed-2", delta: 6, reason: "scan-add", at: seedDaysAgo(38, 9) });
  for (const d of [30, 20, 10]) {
    entries.push({ itemId: "seed-2", delta: -1, reason: "manual-adjust", at: seedDaysAgo(d, 4) });
  }

  return entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

// Guards against a null/undefined/NaN numeric field crashing a render
// somewhere downstream (e.g. ItemCard's pricePerUnit.toFixed(2)) — seen in
// practice on a real device where an item had ended up with a null price,
// which blanked the entire app since nothing here was ever validated on
// the way out of localStorage. Every read path funnels through loadItems,
// so this is the one place that needs to normalize.
function normalizeItem(item: InventoryItem): InventoryItem {
  return {
    ...item,
    quantity: Number.isFinite(item.quantity) ? item.quantity : 0,
    pricePerUnit: Number.isFinite(item.pricePerUnit) ? item.pricePerUnit : 0,
    reorderAt: Number.isFinite(item.reorderAt) ? item.reorderAt : 0,
  };
}

export function loadItems(): InventoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ITEMS_KEY);
    if (!raw) {
      window.localStorage.setItem(ITEMS_KEY, JSON.stringify(SEED_ITEMS));
      // Seed the demo history alongside the demo items, but only if there
      // genuinely isn't a movement log yet - a customer who wiped just
      // their item list keeps whatever real history they'd built up, and
      // never gets fake entries mixed into it.
      if (!window.localStorage.getItem(MOVEMENTS_KEY)) {
        logMovements(buildSeedMovements());
      }
      return SEED_ITEMS;
    }
    const parsed = JSON.parse(raw) as InventoryItem[];
    return Array.isArray(parsed) ? parsed.map(normalizeItem) : [];
  } catch {
    return [];
  }
}

// The one genuinely reliable "has this browser ever opened this app
// before" signal - loadItems() above reseeds SEED_ITEMS precisely when
// ITEMS_KEY is entirely absent, so checking for that same absence *before*
// calling loadItems() (which would immediately write the seed data and
// erase the signal) is how the new-customer tutorial decides whether to
// launch itself. Deliberately not inferred from "items happen to still
// look like the 3 seed items" - a customer could delete everything down to
// a coincidentally-similar state and this would misfire.
export function isFreshInstall(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ITEMS_KEY) === null;
}

export type TutorialCompletionReason = "finished" | "skipped";

export function getTutorialCompleted(): boolean {
  if (typeof window === "undefined") return true; // never auto-launch during SSR
  return window.localStorage.getItem(TUTORIAL_KEY) !== null;
}

export function setTutorialCompleted(reason: TutorialCompletionReason): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TUTORIAL_KEY, reason);
}

// Whether the customer has waved off the first-visit "take the tour"
// invitation. Separate from TUTORIAL_KEY because they answer different
// questions: TUTORIAL_KEY means "the tour has run," this means "we've
// already asked." A customer who dismisses the chip without taking the
// tour shouldn't be asked twice, but should still be offered the tour
// again if they later clear their cache - which is exactly what removing
// the key alongside everything else in clearAppCache gives us.
export function getTourInviteDismissed(): boolean {
  if (typeof window === "undefined") return true; // never flash the chip during SSR
  return window.localStorage.getItem(TOUR_INVITE_DISMISSED_KEY) !== null;
}

export function setTourInviteDismissed(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOUR_INVITE_DISMISSED_KEY, "1");
}

// Used by the "Replay tutorial" link in AccountTab - lets a customer pull
// the walkthrough back up on demand even though it's well past its one
// automatic launch on a fresh install.
export function resetTutorialCompleted(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TUTORIAL_KEY);
}

// The main Inventory-side welcome tour's own optional voice narration,
// added after the Property tour's identical feature (see
// PROPERTY_TUTORIAL_VOICE_KEY below) proved out well enough that the user
// asked for it here too. Kept under its own key, same reasoning as the
// completion-flag pairing above: muting one tour's voice shouldn't mute
// the other's.
const TUTORIAL_VOICE_KEY = "isc_tutorial_voice_v1";

export function getTutorialVoiceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(TUTORIAL_VOICE_KEY) !== "0";
}

export function setTutorialVoiceEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TUTORIAL_VOICE_KEY, enabled ? "1" : "0");
}

// Same three-function shape as the main tutorial above, kept under its own
// key so finishing/skipping/replaying the Property tour never touches the
// main app's own tutorial state (a customer could plausibly complete one
// and not the other, or replay just one) — see
// PropertyTutorialOverlay.tsx/propertyTutorial.ts.
const PROPERTY_TUTORIAL_KEY = "isc_property_tutorial_completed_v1";

export function getPropertyTutorialCompleted(): boolean {
  if (typeof window === "undefined") return true; // never auto-launch during SSR
  return window.localStorage.getItem(PROPERTY_TUTORIAL_KEY) !== null;
}

export function setPropertyTutorialCompleted(reason: TutorialCompletionReason): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROPERTY_TUTORIAL_KEY, reason);
}

export function resetPropertyTutorialCompleted(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PROPERTY_TUTORIAL_KEY);
}

// Whether the Property tour should read each step's card aloud. Defaults to
// on (missing key reads as enabled) per how this was asked for; a customer
// who mutes it via the tour's own speaker toggle gets that respected on
// every future run/replay until they turn it back on.
const PROPERTY_TUTORIAL_VOICE_KEY = "isc_property_tutorial_voice_v1";

export function getPropertyTutorialVoiceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(PROPERTY_TUTORIAL_VOICE_KEY) !== "0";
}

export function setPropertyTutorialVoiceEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROPERTY_TUTORIAL_VOICE_KEY, enabled ? "1" : "0");
}

export function saveItems(items: InventoryItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

export function getInstallBannerDismissed(): boolean {
  if (typeof window === "undefined") return true; // never flash the banner during SSR
  return window.localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) !== null;
}

export function setInstallBannerDismissed(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, "1");
}

export function getLiveInStoreDismissed(): boolean {
  if (typeof window === "undefined") return true; // never flash the card during SSR
  return window.localStorage.getItem(LIVE_INSTORE_DISMISSED_KEY) !== null;
}

export function setLiveInStoreDismissed(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIVE_INSTORE_DISMISSED_KEY, "1");
}

export function getBookingPausedDismissed(): boolean {
  if (typeof window === "undefined") return true; // never flash the overlay during SSR
  return window.localStorage.getItem(BOOKING_PAUSED_DISMISSED_KEY) !== null;
}

export function setBookingPausedDismissed(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BOOKING_PAUSED_DISMISSED_KEY, "1");
}

export function getEditorName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(EDITOR_NAME_KEY);
}

export function setEditorName(name: string | null): void {
  if (typeof window === "undefined") return;
  const trimmed = (name ?? "").trim();
  if (trimmed) window.localStorage.setItem(EDITOR_NAME_KEY, trimmed);
  else window.localStorage.removeItem(EDITOR_NAME_KEY);
}

export type RetailerSearchBy = "auto" | "barcode" | "name";

export function getRetailerSearchBy(): RetailerSearchBy {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(RETAILER_SEARCH_BY_KEY);
  return v === "barcode" || v === "name" ? v : "auto";
}

export function setRetailerSearchBy(value: RetailerSearchBy): void {
  if (typeof window === "undefined") return;
  if (value === "auto") window.localStorage.removeItem(RETAILER_SEARCH_BY_KEY);
  else window.localStorage.setItem(RETAILER_SEARCH_BY_KEY, value);
}

// Local-only "start fresh": wipes this device's inventory and usage
// history back to a genuinely empty state. This is the counterpart to the
// Google Sheets section's "Start Fresh (new sheet)" button, which only
// ever existed for customers signed into Google — someone who never
// connects Google Sheets had no equivalent way to wipe out the 3 seed/demo
// items and any real data they'd entered, and start over clean.
//
// Deliberately writes an empty array rather than removeItem-ing ITEMS_KEY:
// loadItems() treats a *missing* key as "never opened this app before" and
// reseeds the demo items (see SEED_ITEMS above) - that's the right call
// for a brand new install, but wrong here, where the customer explicitly
// asked for empty and reseeding demo data back in would look like data
// loss turned into confusing fake inventory instead.
export function startFreshInventory(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ITEMS_KEY, JSON.stringify([]));
  window.localStorage.removeItem(MOVEMENTS_KEY);
  window.localStorage.removeItem(PACKAGE_TRACKING_KEY);
}

export function getLinkedSheetId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SHEET_LINK_KEY);
}

export function setLinkedSheetId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(SHEET_LINK_KEY, id);
  else window.localStorage.removeItem(SHEET_LINK_KEY);
}

// How the Inventory list is ordered - remembered per device so a customer's
// chosen view sticks around across visits instead of resetting every time.
// "recent" (most recently changed or scanned first) is the default: it
// reuses the same updatedAt timestamp every mutation path already bumps
// (manual adjust, scan add/remove, edit, import, Break Case), so whatever a
// customer just touched surfaces at the top without any new tracking.
export type InventorySort = "recent" | "name" | "low-stock";

export function getInventorySort(): InventorySort {
  if (typeof window === "undefined") return "recent";
  const v = window.localStorage.getItem(INVENTORY_SORT_KEY);
  return v === "name" || v === "low-stock" ? v : "recent";
}

export function setInventorySort(sort: InventorySort): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INVENTORY_SORT_KEY, sort);
}

// Which break-down parent groups (Unity-hierarchy-style foldouts in the
// Inventory tab — see InventoryTab.tsx's groupBreakDownChildren) the
// customer has collapsed, so a case item they've already tucked away
// stays tucked away across visits instead of re-expanding every reload.
// Keyed by the *parent's own barcode* rather than its id, matching how the
// break-down relationship itself is stored (see InventoryItem.
// breaksDownIntoBarcode in types.ts) — an id is only stable on the device
// that generated it, a barcode survives an import or a second device.
const COLLAPSED_BREAKDOWN_GROUPS_KEY = "isc_collapsed_breakdown_groups_v1";

export function getCollapsedBreakdownGroups(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_BREAKDOWN_GROUPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

export function setCollapsedBreakdownGroups(barcodes: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COLLAPSED_BREAKDOWN_GROUPS_KEY, JSON.stringify(Array.from(barcodes)));
}

// Stock movement log, used by the Usage tab to chart how fast a product is
// actually being consumed. Every scan-in, scan-out, manual adjustment, and
// import that changes an item's quantity appends one entry here. This only
// starts recording once this feature ships, so existing customers will see
// an empty chart until they've used the app a bit - there's no way to
// retroactively reconstruct history that was never logged.
export function loadMovements(): StockMovement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MOVEMENTS_KEY);
    return raw ? (JSON.parse(raw) as StockMovement[]) : [];
  } catch {
    return [];
  }
}

export function logMovement(entry: Omit<StockMovement, "id">): void {
  if (typeof window === "undefined") return;
  if (!entry.delta) return; // no actual quantity change - nothing to log
  const movements = loadMovements();
  movements.push({ id: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...entry });
  const trimmed = movements.length > MAX_MOVEMENTS ? movements.slice(movements.length - MAX_MOVEMENTS) : movements;
  window.localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(trimmed));
}

// Bulk version of logMovement, for usage-history imports that can add
// hundreds of rows at once — appending one at a time would mean one
// localStorage read+write per row, which gets slow (and racy, since each
// call reads-then-writes independently) fast at that volume. Does one read
// and one write for the whole batch instead.
export function logMovements(entries: Omit<StockMovement, "id">[]): void {
  if (typeof window === "undefined" || !entries.length) return;
  const movements = loadMovements();
  const withIds = entries
    .filter((e) => e.delta) // no actual quantity change - nothing to log
    .map((e, i) => ({ id: `mv-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`, ...e }));
  const combined = [...movements, ...withIds];
  const trimmed = combined.length > MAX_MOVEMENTS ? combined.slice(combined.length - MAX_MOVEMENTS) : combined;
  window.localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(trimmed));
}

// Full-replacement write for the movement log — used by Google Sheets
// Usage-pull reconciliation (see googleSheets.ts's pullUsageFromSheet and
// usageReport.ts's reconcileUsageFromSheetRows), which can update, add, or
// remove individual entries based on what's now in the customer's sheet.
// Applies the same MAX_MOVEMENTS trim as the other write paths so a huge
// reconciled history can't blow past the storage cap.
export function replaceMovements(movements: StockMovement[]): void {
  if (typeof window === "undefined") return;
  const trimmed =
    movements.length > MAX_MOVEMENTS ? movements.slice(movements.length - MAX_MOVEMENTS) : movements;
  window.localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(trimmed));
}

// EXPERIMENTAL — package tracking log (see PackageTracking in types.ts for
// what "experimental" means here). Same local-first, itemId-keyed-array
// shape as the movement log above, and the same MAX cap reasoning: this is
// a customer-entered convenience log, not a database, so it's fine (and
// simpler) to just drop the oldest entries rather than paginate/archive.
const PACKAGE_TRACKING_KEY = "isc_package_tracking_v1";
const MAX_PACKAGE_TRACKING = 200;

export function loadPackageTracking(): PackageTracking[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PACKAGE_TRACKING_KEY);
    return raw ? (JSON.parse(raw) as PackageTracking[]) : [];
  } catch {
    return [];
  }
}

export function addPackageTracking(entry: Omit<PackageTracking, "id" | "addedAt">): PackageTracking {
  const record: PackageTracking = {
    id: `trk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    addedAt: new Date().toISOString(),
    ...entry,
  };
  if (typeof window === "undefined") return record;
  const all = loadPackageTracking();
  all.push(record);
  const trimmed = all.length > MAX_PACKAGE_TRACKING ? all.slice(all.length - MAX_PACKAGE_TRACKING) : all;
  window.localStorage.setItem(PACKAGE_TRACKING_KEY, JSON.stringify(trimmed));
  return record;
}

// Hides a tracking entry from view (received, cancelled, entered wrong)
// without deleting it outright — see the `dismissed` field's comment in
// types.ts for why. Use deletePackageTracking below for a real, permanent
// removal.
export function setPackageTrackingDismissed(id: string, dismissed: boolean): void {
  if (typeof window === "undefined") return;
  const all = loadPackageTracking().map((t) => (t.id === id ? { ...t, dismissed } : t));
  window.localStorage.setItem(PACKAGE_TRACKING_KEY, JSON.stringify(all));
}

export function deletePackageTracking(id: string): void {
  if (typeof window === "undefined") return;
  const all = loadPackageTracking().filter((t) => t.id !== id);
  window.localStorage.setItem(PACKAGE_TRACKING_KEY, JSON.stringify(all));
}

// --- Property management (2026-07) --------------------------------------
// Same local-first shape as ITEMS_KEY above, but a fully separate key and
// array — Property items are a distinct tracked list from inventory, not a
// variant of it (see PropertyItem's comment in types.ts). Deliberately no
// *default* seed data here: a brand-new customer lands on an empty property
// list rather than demo fixtures, since (unlike the inventory tab) there's
// no natural example to seed that would apply to every business. The one
// scoped exception is the guided tour below (PropertyTutorialOverlay.tsx) —
// it seeds exactly one clearly-labeled example property purely so it has
// something real to spotlight, the same reason Inventory ships 3 sample
// items for its own tour, and only when the property list is empty.
const PROPERTY_KEY = "isc_property_items_v1";

export function loadPropertyItems(): PropertyItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROPERTY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PropertyItem[];
    return Array.isArray(parsed)
      ? parsed.map((p) => ({
          ...p,
          // Backfill for records saved before statusHistory existed (2026-07)
          // — same "parse-with-defaults" pattern as parseBookingRecord in
          // booking.ts. A part/task with no history yet gets a single entry
          // synthesized from its current status/updatedAt, so the log is
          // never empty even for pre-existing data.
          orderedParts: (p.orderedParts ?? []).map((part) => ({
            ...part,
            statusHistory:
              part.statusHistory && part.statusHistory.length
                ? part.statusHistory
                : [{ status: part.status, at: part.updatedAt }],
          })),
          maintenanceTasks: (p.maintenanceTasks ?? []).map((task) => ({
            ...task,
            statusHistory:
              task.statusHistory && task.statusHistory.length
                ? task.statusHistory
                : [{ status: task.status, at: task.updatedAt }],
          })),
        }))
      : [];
  } catch {
    return [];
  }
}

export function savePropertyItems(items: PropertyItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROPERTY_KEY, JSON.stringify(items));
}

// --- Property Sheets sync state (per linked spreadsheet) -----------------
// Mirrors the Inventory/Usage sync-token and last-synced-at pattern below
// exactly, but kept under entirely separate keys and its own token cell in
// the sheet's hidden _sync tab (see PROPERTY_SYNC_TOKEN_RANGE in
// googleSheets.ts) — a push from the Property page has nothing to do with
// Inventory/Usage's own conflict tracking, so the two must never share a
// token or a "someone else changed this" false positive/negative would
// leak across two otherwise-unrelated feature areas of the same sheet.

function propertySyncTokenKey(spreadsheetId: string): string {
  return `isc_property_sync_token_v1:${spreadsheetId}`;
}

export function getLastPropertySyncToken(spreadsheetId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(propertySyncTokenKey(spreadsheetId));
}

export function setLastPropertySyncToken(spreadsheetId: string, tokenValue: string | null): void {
  if (typeof window === "undefined") return;
  if (tokenValue) window.localStorage.setItem(propertySyncTokenKey(spreadsheetId), tokenValue);
  else window.localStorage.removeItem(propertySyncTokenKey(spreadsheetId));
}

function propertySyncedAtKey(spreadsheetId: string): string {
  return `isc_property_sync_time_v1:${spreadsheetId}`;
}

export function getLastPropertySyncedAt(spreadsheetId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(propertySyncedAtKey(spreadsheetId));
}

export function setLastPropertySyncedAt(spreadsheetId: string, iso: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(propertySyncedAtKey(spreadsheetId), iso);
}

// --- Google Sheets sync state (per linked spreadsheet) ------------------
// Both of these are namespaced by spreadsheetId (rather than one global
// value) so switching which sheet is linked, or a customer using more than
// one spreadsheet across different devices, can't cross-contaminate sync
// state between them.

function syncTokenKey(spreadsheetId: string): string {
  return `isc_sync_token_v1:${spreadsheetId}`;
}
function syncedUsageIdsKey(spreadsheetId: string): string {
  return `isc_synced_usage_ids_v1:${spreadsheetId}`;
}

// The last sync token this device has seen written to the spreadsheet —
// either one it wrote itself (after a push) or one it read while pulling.
// Compared against the sheet's *current* token before every push to catch
// "another device pushed since I last synced here" (see
// googleSheets.ts's getRemoteSyncToken/setRemoteSyncToken and AccountTab's
// pushAll) — this is the actual mechanism behind the conflict warning.
export function getLastSyncToken(spreadsheetId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(syncTokenKey(spreadsheetId));
}

export function setLastSyncToken(spreadsheetId: string, tokenValue: string | null): void {
  if (typeof window === "undefined") return;
  if (tokenValue) window.localStorage.setItem(syncTokenKey(spreadsheetId), tokenValue);
  else window.localStorage.removeItem(syncTokenKey(spreadsheetId));
}

// The set of usage-movement ids this device believes are currently
// represented as rows in the sheet's Usage tab, as of the last push or
// pull. Needed so a pull can tell "this row was deleted from the sheet"
// (id is in this set but missing from the sheet now) apart from "this
// movement was never synced in the first place" (never in this set) — see
// reconcileUsageFromSheetRows in usageReport.ts for how that distinction
// drives whether a local movement gets deleted.
export function getSyncedUsageIds(spreadsheetId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(syncedUsageIdsKey(spreadsheetId));
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function setSyncedUsageIds(spreadsheetId: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(syncedUsageIdsKey(spreadsheetId), JSON.stringify(ids));
}

// When this device last successfully pushed or pulled this spreadsheet —
// purely informational (see AccountTab's "Last synced" line), so someone
// signed in on more than one device has a visible signal for "is what I'm
// looking at here actually current," rather than only finding out a sync
// was stale after a push conflict warning fires. Doesn't affect conflict
// detection itself — that's the sync token above.
function syncedAtKey(spreadsheetId: string): string {
  return `isc_sync_time_v1:${spreadsheetId}`;
}

export function getLastSyncedAt(spreadsheetId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(syncedAtKey(spreadsheetId));
}

export function setLastSyncedAt(spreadsheetId: string, iso: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(syncedAtKey(spreadsheetId), iso);
}

export type CookieConsent = "accepted" | "declined" | null;

// Fired on window whenever the customer's choice changes, so anything else
// mounted in the tree that gates behavior on consent (see
// GoogleAnalytics.tsx) can react immediately without needing a reload —
// CookieConsentBanner and a consent-gated component like that one are
// siblings under layout.tsx, not parent/child, so a plain callback prop
// can't reach across; a window event is the simplest thing that can.
const COOKIE_CONSENT_EVENT = "isc-cookie-consent-changed";

export function getCookieConsent(): CookieConsent {
  if (typeof window === "undefined") return null;
  return (window.localStorage.getItem(COOKIE_CONSENT_KEY) as CookieConsent) || null;
}

export function setCookieConsent(value: Exclude<CookieConsent, null>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COOKIE_CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent<CookieConsent>(COOKIE_CONSENT_EVENT, { detail: value }));
}

// Subscribes to consent changes; returns an unsubscribe function so callers
// can clean up in a useEffect the normal way.
export function onCookieConsentChange(handler: (value: CookieConsent) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<CookieConsent>).detail);
  window.addEventListener(COOKIE_CONSENT_EVENT, listener);
  return () => window.removeEventListener(COOKIE_CONSENT_EVENT, listener);
}

// Clears everything this app has cached locally: the Cache Storage API
// (service worker assets), and app-namespaced localStorage keys. This is
// what the trash-can icon in the header (ClearCacheButton.tsx) calls. It intentionally
// does NOT touch the customer's Google Sheet data (that lives on Google's
// servers, not in this browser) or their signed-in Stripe access - clearing
// cache should never accidentally sign a paying customer out of support.
export async function clearAppCache(): Promise<void> {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(ITEMS_KEY);
  window.localStorage.removeItem(SHEET_LINK_KEY);
  window.localStorage.removeItem(MOVEMENTS_KEY);
  window.localStorage.removeItem(PACKAGE_TRACKING_KEY);
  window.localStorage.removeItem(PROPERTY_KEY);
  // Removing ITEMS_KEY here is also what makes isFreshInstall() true again
  // on the next load (reseeding the demo items) - clearing the tutorial
  // flag alongside it keeps those two "brand new customer" signals in
  // sync, so a full cache clear genuinely resets to a first-open experience
  // rather than reseeding demo items with no tour to explain them.
  window.localStorage.removeItem(TUTORIAL_KEY);
  // The invitation chip goes with it - a customer looking at freshly
  // reseeded demo items should be offered the tour that explains them.
  window.localStorage.removeItem(TOUR_INVITE_DISMISSED_KEY);
  // Same reasoning, same pairing, for Property: clearing PROPERTY_KEY empties
  // the list again, so the Property tour's completion flag resets alongside
  // it rather than leaving a blank list with no tour to explain it either.
  window.localStorage.removeItem(PROPERTY_TUTORIAL_KEY);
  // Sync tokens/synced-id sets are namespaced per spreadsheetId (see
  // above) rather than one fixed key, so they need an explicit scan
  // rather than a single removeItem — this is also the way a customer
  // can force-reset a stuck conflict warning if sync state ever gets
  // wedged.
  Object.keys(window.localStorage)
    .filter(
      (k) =>
        k.startsWith("isc_sync_token_v1:") ||
        k.startsWith("isc_synced_usage_ids_v1:") ||
        k.startsWith("isc_sync_time_v1:") ||
        k.startsWith("isc_property_sync_token_v1:") ||
        k.startsWith("isc_property_sync_time_v1:")
    )
    .forEach((k) => window.localStorage.removeItem(k));

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }
}
