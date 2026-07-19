"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { clearAppCache } from "@/lib/storage";

// Small icon-only trash-can button meant to sit right next to the header's
// gear icon — brought back from an earlier version of the app, where this
// was a one-tap-away action rather than something buried inside the
// Support tab. Uses a lightweight inline confirm (tap once to arm, tap
// again to actually clear) instead of a native confirm() dialog, matching
// the rest of the app's UI rather than a jarring browser popup — this is
// destructive (wipes local items/movements/sheet link), so it shouldn't
// fire on a single accidental tap.
export default function ClearCacheButton() {
  const [armed, setArmed] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClick = async () => {
    if (!armed) {
      setArmed(true);
      // Auto-disarm after a few seconds so a stray later tap can't clear
      // the cache long after the customer meant to cancel.
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setClearing(true);
    try {
      await clearAppCache();
      window.location.reload();
    } finally {
      setClearing(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={clearing}
      aria-label={armed ? "Tap again to confirm clearing cache" : "Clear cache & reload"}
      title={armed ? "Tap again to confirm" : "Clear cache & reload"}
      className={`rounded-lg p-1.5 hover:bg-surface-muted disabled:opacity-50 ${
        armed ? "text-accent-low" : "text-neutral-500"
      }`}
    >
      <Trash2 size={18} />
    </button>
  );
}
