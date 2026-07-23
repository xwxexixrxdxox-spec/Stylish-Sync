"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import {
  getDeferredInstallPrompt,
  isIosSafari,
  isStandalone,
  subscribeInstallPrompt,
  triggerInstallPrompt,
} from "@/lib/installPrompt";
import { getCookieConsent } from "@/lib/storage";
import { getInstallBannerDismissed, setInstallBannerDismissed } from "@/lib/storage";

// The closeable "Install app" pop-up banner from earlier versions of the
// app, brought back per request — a low-friction nudge on the main screen
// that a customer can dismiss for good, rather than a permanent button
// buried in Account (that button still exists there as the always-available
// path). Sits just above the bottom nav.
//
// Deliberately gated on the cookie-consent choice already being made, so it
// never stacks on top of the consent banner (which owns the very bottom of
// the screen for a brand-new visitor); it appears only once that's out of
// the way.
export default function InstallBanner() {
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const ios = isIosSafari();

  useEffect(() => {
    const evaluate = () => {
      if (isStandalone() || getInstallBannerDismissed() || getCookieConsent() === null) {
        setVisible(false);
        return;
      }
      // Chromium: only once the native prompt has actually been captured.
      // iOS Safari: no native prompt ever fires, so offer the manual
      // Add-to-Home-Screen instructions instead.
      setVisible(!!getDeferredInstallPrompt() || isIosSafari());
    };
    evaluate();
    // Re-evaluate when the native prompt is captured (it can arrive after
    // mount) or gets used up.
    const unsub = subscribeInstallPrompt(evaluate);
    // The cookie banner writes its choice to localStorage with no event we
    // can subscribe to, so a light poll picks up "consent just decided"
    // and lets this banner appear right after.
    const timer = window.setInterval(evaluate, 1000);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, []);

  const dismiss = () => {
    setInstallBannerDismissed();
    setVisible(false);
  };

  const install = async () => {
    if (ios) {
      setShowIosSteps((v) => !v);
      return;
    }
    setInstalling(true);
    try {
      const accepted = await triggerInstallPrompt();
      // Accepted -> appinstalled/standalone hides it anyway; either way
      // don't keep nagging after they've engaged with the prompt.
      if (accepted) setVisible(false);
      else dismiss();
    } finally {
      setInstalling(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 px-3">
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-xl2 border border-surface-border bg-white px-4 py-3 shadow-card">
        <span aria-hidden className="text-lg">
          📦
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900">Install WS Inventory</p>
          <p className="text-[11px] text-neutral-500">
            {showIosSteps
              ? "Tap the Share icon in Safari, then “Add to Home Screen.”"
              : "Add it to your home screen for one-tap access and offline use."}
          </p>
        </div>
        <button
          onClick={install}
          disabled={installing}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {ios ? <Share size={13} /> : <Download size={13} />}
          {installing ? "Installing…" : ios ? (showIosSteps ? "Hide steps" : "How to") : "Install"}
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss install banner"
          className="shrink-0 rounded-lg p-1 text-neutral-400 hover:bg-surface-muted hover:text-neutral-700"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
