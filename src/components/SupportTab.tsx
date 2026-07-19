"use client";

import SupportChatWidget from "./SupportChatWidget";

// "Clear Cache & Reload" used to live here as a full-width button, but
// moved back to a small trash-can icon next to the header's gear icon
// (see page.tsx / ClearCacheButton.tsx) — a QoL pattern from an earlier
// version of the app that put it one tap away instead of buried in a tab.
export default function SupportTab() {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="mb-4 text-lg font-semibold text-neutral-900">Support</h1>
      <SupportChatWidget />
    </div>
  );
}
