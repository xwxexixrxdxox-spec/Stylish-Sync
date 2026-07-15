"use client";

import { InventoryItem } from "./types";

// Local-first storage: the app works fully offline using localStorage as
// the always-available cache, with Google Sheets as an optional
// two-way sync layer on top (see googleSheets.ts). This mirrors both
// source apps: Base44's app worked without any account, and the ISC app
// treated the Google Sheet as the durable copy while still functioning
// off the local form state.

const ITEMS_KEY = "isc_inventory_items_v1";
const SHEET_LINK_KEY = "isc_google_sheet_id_v1";
const COOKIE_CONSENT_KEY = "isc_cookie_consent_v1";

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
  },
];

export function loadItems(): InventoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ITEMS_KEY);
    if (!raw) {
      window.localStorage.setItem(ITEMS_KEY, JSON.stringify(SEED_ITEMS));
      return SEED_ITEMS;
    }
    return JSON.parse(raw) as InventoryItem[];
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
// what the Settings > "Clear Cache & Reload" button calls. It intentionally
// does NOT touch the customer's Google Sheet data (that lives on Google's
// servers, not in this browser) or their signed-in Stripe access — clearing
// cache should never accidentally sign a paying customer out of support.
export async function clearAppCache(): Promise<void> {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(ITEMS_KEY);
  window.localStorage.removeItem(SHEET_LINK_KEY);

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }
}
