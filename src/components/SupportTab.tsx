"use client";

import SupportChatWidget from "./SupportChatWidget";

export default function SupportTab() {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="mb-4 text-lg font-semibold text-neutral-900">Support</h1>
      <SupportChatWidget />
    </div>
  );
}
