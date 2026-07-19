"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { clearAppCache } from "@/lib/storage";
import SupportChatWidget from "./SupportChatWidget";

export default function SupportTab() {
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleClearCache = async () => {
    setClearing(true);
    try {
      await clearAppCache();
      setMessage("Cache cleared. Reloading…");
      setTimeout(() => window.location.reload(), 800);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="mb-4 text-lg font-semibold text-neutral-900">Support</h1>
      <SupportChatWidget />

      <section className="mt-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <p className="mb-3 text-sm font-medium text-neutral-900">Troubleshooting</p>
        <button
          disabled={clearing}
          onClick={handleClearCache}
          className="flex w-full items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
        >
          <Trash2 size={14} /> {clearing ? "Clearing…" : "Clear Cache & Reload"}
        </button>
        {message && <p className="mt-2 text-center text-xs font-medium text-neutral-600">{message}</p>}
      </section>
    </div>
  );
}
