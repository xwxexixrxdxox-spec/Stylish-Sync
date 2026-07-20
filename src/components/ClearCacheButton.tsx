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
      // blanks the video element; the short pause below gives that a
      // paint frame to actually take effect before the snapshot is
      // captured, and before the service worker/Cache Storage teardown
      // below needs to visually settle too.
      //
      // That pause was originally two chained requestAnimationFrame
      // callbacks - which turned out to be a real bug, not just a
      // theoretical one: rAF callbacks are suspended entirely while a tab
      // is backgrounded/not visible (confirmed live - this button got
      // stuck on "Working..." indefinitely in a background tab, since the
      // browser never scheduled the frames to resolve the promise). A
      // customer backgrounding the app for a second right after tapping
      // this - switching apps, a notification, locking their phone -
      // would have hit the exact same hang. setTimeout doesn't have that
      // failure mode: background tabs throttle it, they don't suspend it,
      // so it always eventually fires.
      stopActiveCameraStream();
      // Belt-and-suspenders after the rAF hang above: race the actual
      // clear + settle pause against a hard cap, so a customer can never
      // get stuck staring at "Working..." again - not from this delay, and
      // not from some other browser API call inside clearAppCache() that
      // might hang for an unrelated reason on some device. Whatever
      // hasn't finished clearing by then just gets left for next time;
      // reloading either way is strictly better than a frozen button.
      await Promise.race([
        clearAppCache().then(() => new Promise((resolve) => setTimeout(resolve, 50))),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } finally {
      window.location.reload();
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
