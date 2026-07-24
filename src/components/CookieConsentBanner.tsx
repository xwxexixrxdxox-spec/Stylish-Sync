"use client";

import { useEffect, useState } from "react";
import { getCookieConsent, setCookieConsent } from "@/lib/storage";

// A lightweight cookie/consent banner so the app can remember local
// preferences (and, for paying customers, the signed access cookie used to
// unlock support) with the customer's knowledge. Strictly-necessary items
// (like the payment-verification cookie) work regardless of this choice —
// declining only affects optional local memory such as remembering your
// last-used import format, plus (see GoogleAnalytics.tsx) whether Google
// Analytics loads at all.
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getCookieConsent() === null);
  }, []);

  if (!visible) return null;

  const choose = (value: "accepted" | "declined") => {
    setCookieConsent(value);
    setVisible(false);
  };

  return (
    // data-tutorial: the new-customer walkthrough spotlights this banner as
    // an early step (see tutorial.ts's "cookie-consent" step) — at z-50 it
    // sits above the bottom nav (z-30), so leaving it unresolved would keep
    // it covering exactly the tabs the rest of the tour points at.
    <div
      data-tutorial="cookie-banner"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-surface-border bg-white/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:px-6"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          We use essential cookies to keep you signed in and remember your preferences on this device. Accepting
          also turns on optional analytics that help us understand how the app is used.{" "}
          <a href="/privacy" className="underline underline-offset-2 hover:text-neutral-900">
            Privacy Policy
          </a>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => choose("declined")}
            className="rounded-lg border border-surface-border px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted"
          >
            Decline
          </button>
          <button
            onClick={() => choose("accepted")}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:opacity-90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
