"use client";

import { InventoryItem, StockMovement } from "./types";

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
// Caps how much movement history we keep in localStorage. The Usage tab's
// date filter now goes up to "All time," so this needs to comfortably
// cover several years of realistic activity rather than "well over a
// year" — bumped from 2000 to 20000 (roughly 2MB of JSON at typical entry
// size), which stays safely under the ~5-10MB per-origin quota most
// browsers give localStorage. An extremely high-volume, many-years-active
// customer could still eventually roll off the oldest entries; there's no
// way around that without moving history off localStorage entirely.
const MAX_MOVEMENTS = 20000;

const SEED_ITEMS: InventoryItem[] = [
  {
    id: "seed-1",
    barcode: "8412345678905",
    name: "Premium Notebook A5",
    quantity: 14,
    unit: "ea",
    pricePerUnit: 3.5,
    reorderAt: 5,
    updatedAt: new Date().toISOString(),
    location: "Dry Stock",
  },
  {
    id: "seed-2",
    barcode: "8412345678912",
    name: "Ballpoint Pens (blue)",
    quantity: 3,
    unit: "pack",
    pricePerUnit: 2.0,
    reorderAt: 4,
    updatedAt: new Date().toISOString(),
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
    updatedAt: new Date().toISOString(),
    location: "Cooler",
  },
];

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
      return SEED_ITEMS;
    }
    const parsed = JSON.parse(raw) as InventoryItem[];
    return Array.isArray(parsed) ? parsed.map(normalizeItem) : [];
  } catch {
    return [];
  }
}

export function saveItems(items: InventoryItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
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

export function getCookieConsent(): CookieConsent {
  if (typeof window === "undefined") return null;
  return (window.localStorage.getItem(COOKIE_CONSENT_KEY) as CookieConsent) || null;
}

export function setCookieConsent(value: Exclude<CookieConsent, null>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COOKIE_CONSENT_KEY, value);
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
        k.startsWith("isc_sync_time_v1:")
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
