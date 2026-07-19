"use client";

// Captures the browser's native "install this app" prompt (Chromium's
// `beforeinstallprompt` event) so it can be triggered later from a button
// inside the account panel, instead of only the browser's own one-shot
// auto-popup. Chrome only fires this event once per page load and only if
// the PWA install criteria are met (valid manifest + service worker,
// HTTPS, not already installed) — customers who dismissed that one auto
// popup previously had no way to bring it back, which is the gap this
// closes.
//
// Module-level (not React state) because the event can fire before the
// account panel — where the "Install app" button lives — has ever
// mounted; subscribers just re-render when it arrives.

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: DeferredInstallPrompt | null = null;
let captured = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function initInstallPromptCapture(): void {
  if (typeof window === "undefined" || captured) return;
  captured = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // suppress the browser's own auto-popup — we drive it from the UI instead
    deferredPrompt = e as DeferredInstallPrompt;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export function subscribeInstallPrompt(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDeferredInstallPrompt(): DeferredInstallPrompt | null {
  return deferredPrompt;
}

// Triggers the native install UI. Resolves to whether the customer
// actually accepted — either way, Chrome only lets a captured prompt be
// used once, so it's cleared after this regardless of the outcome.
export async function triggerInstallPrompt(): Promise<boolean> {
  const prompt = deferredPrompt;
  if (!prompt) return false;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  deferredPrompt = null;
  notify();
  return choice.outcome === "accepted";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

// iOS Safari never fires beforeinstallprompt — "Add to Home Screen" is
// only reachable through the Share sheet, so the best this app can do
// there is show instructions rather than a one-tap button.
export function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !isStandalone();
}
