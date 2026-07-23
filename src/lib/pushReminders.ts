"use client";

import { InventoryItem } from "./types";
import { loadMovements } from "./storage";
import { isLowStock, stockDeficit } from "./reorderStatus";

// Client side of the opt-in reorder-reminder push notifications — see
// pushServer.ts for the overall architecture. This module owns: asking for
// notification permission, subscribing this browser's service worker to
// push, and computing the "digest" (the compact summary of low-stock and
// high-usage items) that the server composes notifications from.
//
// The digest math mirrors the Usage tab's semantics (UsageTab.tsx): only
// negative stock movements count as usage — restocks never inflate an
// item's consumption rate.

// How far back to look when computing an item's usage rate. Two weeks is
// long enough to smooth out a slow weekend, short enough that "how fast is
// this moving" reflects the current pace rather than last quarter's.
const USAGE_WINDOW_DAYS = 14;
const MAX_ITEMS_PER_LIST = 10;

export interface DigestPayload {
  lowStock: { name: string; quantity: number; unit: string; reorderAt: number }[];
  highUsage: { name: string; quantity: number; unit: string; avgPerDay: number; daysLeft: number }[];
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  // The app's SW is registered on load (ServiceWorkerRegistrar) — .ready
  // waits for it rather than racing it.
  return navigator.serviceWorker.ready.catch(() => null);
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription().catch(() => null);
}

// The applicationServerKey must be raw bytes, but VAPID public keys travel
// as base64url strings — standard conversion.
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

export function buildDigest(items: InventoryItem[]): DigestPayload {
  const movements = loadMovements();
  const cutoff = Date.now() - USAGE_WINDOW_DAYS * 86_400_000;

  const lowStock = items
    // A case/pack with a linked broken-down item doesn't count as low just
    // because its own quantity dipped — see reorderStatus.ts. Keeps push
    // reminders from nagging about a case that still has a full buffer of
    // loose stock backing it up.
    .filter((it) => isLowStock(it, items))
    // Biggest deficit first — same urgency ordering the Inventory tab's
    // "Low stock first" sort uses.
    .sort((a, b) => stockDeficit(b, items) - stockDeficit(a, items))
    .slice(0, MAX_ITEMS_PER_LIST)
    .map((it) => ({ name: it.name, quantity: it.quantity, unit: it.unit, reorderAt: it.reorderAt }));

  const usedByItem = new Map<string, number>();
  for (const m of movements) {
    if (m.delta >= 0) continue; // only consumption counts as usage
    if (new Date(m.at).getTime() < cutoff) continue;
    usedByItem.set(m.itemId, (usedByItem.get(m.itemId) ?? 0) + Math.abs(m.delta));
  }

  const highUsage = items
    .map((it) => {
      const used = usedByItem.get(it.id) ?? 0;
      const avgPerDay = used / USAGE_WINDOW_DAYS;
      return {
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        avgPerDay: Math.round(avgPerDay * 100) / 100,
        daysLeft: avgPerDay > 0 ? Math.round((it.quantity / avgPerDay) * 10) / 10 : Infinity,
      };
    })
    .filter((it) => it.avgPerDay > 0)
    .sort((a, b) => b.avgPerDay - a.avgPerDay)
    .slice(0, MAX_ITEMS_PER_LIST)
    // Infinity doesn't survive JSON — clamp to a sentinel the server's
    // "daysLeft <= 14" relevance filter will simply never match.
    .map((it) => ({ ...it, daysLeft: Number.isFinite(it.daysLeft) ? it.daysLeft : 9999 }));

  return { lowStock, highUsage };
}

export type EnableResult = "enabled" | "denied" | "unsupported" | "failed";

export async function enablePushReminders(items: InventoryItem[]): Promise<EnableResult> {
  if (!isPushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = await getRegistration();
  if (!reg) return "failed";
  try {
    const { publicKey } = await fetch("/api/notifications").then((r) => r.json());
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey) as unknown as BufferSource,
      }));
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON(), digest: buildDigest(items) }),
    });
    return res.ok ? "enabled" : "failed";
  } catch {
    return "failed";
  }
}

export async function disablePushReminders(): Promise<void> {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;
  // Server first, then browser: if the unsubscribe half fails, the server
  // record is already gone, so no further notifications can be sent — the
  // worst leftover is a dangling browser subscription nothing writes to.
  await fetch("/api/notifications", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

// Fire-and-forget refresh of the server-side digest, called (debounced)
// whenever inventory changes. Quietly does nothing unless this browser has
// an active subscription — so customers who never opted in never send a
// byte of inventory data anywhere.
export async function syncPushDigest(items: InventoryItem[]): Promise<void> {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;
  await fetch("/api/notifications", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint, digest: buildDigest(items) }),
  }).catch(() => {});
}
