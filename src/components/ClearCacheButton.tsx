"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { clearAppCache } from "@/lib/storage";
import { stopActiveCameraStream } from "@/lib/activeCameraStream";
import Tooltip from "./Tooltip";
import ConfirmDialog from "./ConfirmDialog";

// Small icon-only button meant to sit right next to the header's gear icon
// — brought back from an earlier version of the app, where this was a
// one-tap-away action rather than something buried inside the Support tab.
//
// This used to be a trash-can icon with an inline "tap again to confirm"
// arm step. Now that item cards have their own trash-can delete button
// (see ItemCard.tsx), keeping a second trash icon here risked being read
// as "delete something" rather than "reset the app's local cache" — so
// this is a refresh icon instead, and the confirmation is a real popup
// (shared ConfirmDialog) rather than the inline arm-tap pattern, matching
// how the item-delete confirmations now work.
export default function ClearCacheButton() {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleConfirm = async () => {
    setClearing(true);
    try {
      // This icon sits in the global header, reachable from every tab —
      // including Scan, mid-scan, with the camera actively streaming.
      // Stopping it first (before anything else) matters specifically for
      // the iOS Safari "digital artifact" a tester saw here: WebKit
      // captures a snapshot of the current page for its reload/navigation
      // transition, and a live camera <video> element still rendering
      // frames at that exact moment can get baked into that snapshot —
      // a blurry/noisy frozen camera frame flashing during the reload,
      // which is a very literal "digital artifact." Stopping the stream
      // blanks the video element; the delay below gives that a paint
      // frame to actually take effect before the snapshot is captured.
      stopActiveCameraStream();
      await clearAppCache();
      // Also guards against a related, more general race: reload()
      // triggers WebKit's "restore last snapshot, then transition to the
      // fresh page" animation, and if that fires the instant the service
      // worker unregister + Cache Storage delete promises above resolve,
      // it can race WebKit's own internal teardown of the outgoing
      // worker/cache before the snapshot is captured - producing its own
      // flash of garbled/stale content. Two things reduce that: a short
      // pause (two animation frames) gives both the camera stop above and
      // the teardown a beat to actually finish, and reassigning
      // location.href instead of calling reload() skips that
      // reload-specific snapshot/diff transition altogether. Neither
      // change is observable on other browsers - it's just a marginally
      // slower path to the same fresh page load.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.location.href = window.location.href;
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <Tooltip label="Clear cache & reload" side="bottom">
        <button
          onClick={() => setConfirming(true)}
          disabled={clearing}
          aria-label="Clear cache & reload"
          className="rounded-lg p-1.5 text-neutral-500 hover:bg-surface-muted disabled:opacity-50"
        >
          <RefreshCw size={18} />
        </button>
      </Tooltip>
      {confirming && (
        <ConfirmDialog
          title="Clear cache & reload?"
          message="This clears locally cached inventory data and app files on this device, then reloads. Your Google Sheet isn't affected — if you have one linked, pull from it after reloading to bring your data back."
          confirmLabel="Clear & reload"
          busy={clearing}
          onCancel={() => setConfirming(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
