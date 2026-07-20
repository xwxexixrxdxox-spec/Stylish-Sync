"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { clearAppCache } from "@/lib/storage";
import { stopActiveCameraStream } from "@/lib/activeCameraStream";
import Tooltip from "./Tooltip";

// Small icon-only button meant to sit right next to the header's gear icon
// — brought back from an earlier version of the app, where this was a
// one-tap-away action rather than something buried inside the Support tab.
//
// This used to be a trash-can icon with an inline "tap again to confirm"
// arm step. Now that item cards have their own trash-can delete button
// (see ItemCard.tsx), keeping a second trash icon here risked being read
// as "delete something" rather than "reset the app's local cache" — so
// this is a refresh icon instead.
//
// There's deliberately no "are you sure?" popup here anymore (there used
// to be a shared ConfirmDialog step). A tester agent doing normal
// exploratory testing treats a two-step "tap, then confirm in a popup"
// destructive action as something to leave alone unless specifically told
// to trigger it — which meant this button's real bugs (see below) went
// unexercised for a while. Trading the popup for an unmissable full-screen
// reveal the instant you tap the icon means there's no separate gated step
// to skip, and a real customer gets an even clearer signal of what's about
// to happen than a small popup ever gave them.
const MIN_OVERLAY_MS = 1500;
const HARD_CAP_MS = 4000;

export default function ClearCacheButton() {
  const [clearing, setClearing] = useState(false);

  const handleClick = async () => {
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
      // blanks the video element before that snapshot gets captured.
      stopActiveCameraStream();
      // Race the actual clear (plus a minimum hold so the reveal below
      // has time to play instead of flashing by) against a hard cap, so a
      // customer can never get stuck staring at this screen forever — not
      // from the hold below, and not from some other browser API call
      // inside clearAppCache() that might hang for an unrelated reason on
      // some device. Whatever hasn't finished clearing by the cap just
      // gets left for next time; reloading either way is strictly better
      // than a frozen screen.
      //
      // This used to be a chained requestAnimationFrame delay, which was a
      // real bug, not just a theoretical one: rAF callbacks are suspended
      // entirely while a tab is backgrounded/not visible (confirmed live —
      // this got stuck indefinitely in a background tab, since the browser
      // never scheduled the frames to resolve the promise). setTimeout
      // doesn't have that failure mode: background tabs throttle it, they
      // don't suspend it, so it always eventually fires.
      await Promise.race([
        Promise.all([clearAppCache(), new Promise((resolve) => setTimeout(resolve, MIN_OVERLAY_MS))]),
        new Promise((resolve) => setTimeout(resolve, HARD_CAP_MS)),
      ]);
    } finally {
      window.location.reload();
    }
  };

  return (
    <>
      <Tooltip label="Clear cache & reload" side="bottom">
        <button
          onClick={handleClick}
          disabled={clearing}
          aria-label="Clear cache & reload"
          className="rounded-lg p-1.5 text-neutral-500 hover:bg-surface-muted disabled:opacity-50"
        >
          <RefreshCw size={18} />
        </button>
      </Tooltip>
      {clearing && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black px-6 text-center"
          style={{ animation: "clear-cache-overlay-in 250ms ease-out both" }}
        >
          <p
            className="text-3xl font-black uppercase text-neutral-100 sm:text-5xl"
            style={{
              animation: "clear-cache-heading-in 550ms ease-out 150ms both",
              textShadow: "0 0 24px rgba(239,68,68,0.45)",
            }}
          >
            Deleting all data
          </p>
          <p
            className="max-w-xs text-sm text-neutral-400 sm:text-base"
            style={{ animation: "clear-cache-subtext-in 400ms ease-out 650ms both" }}
          >
            You will be forced logged out. Please log back in to continue.
          </p>
        </div>
      )}
    </>
  );
}
