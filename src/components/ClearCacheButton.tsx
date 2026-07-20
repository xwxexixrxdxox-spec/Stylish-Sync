"use client";

import { useRef, useState } from "react";
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
// There's deliberately no "are you sure?" popup here (there used to be a
// shared ConfirmDialog step, then briefly an instant-trigger-on-tap
// version). A tester agent doing normal exploratory testing treats a
// two-step "tap, then confirm in a popup" destructive action as something
// to leave alone unless specifically told to trigger it — which meant this
// button's real bugs went unexercised for a while. Removing the gate
// entirely on a single tap, though, made a stray tap immediately wipe
// local data with zero friction. A hold-to-confirm gesture is the middle
// ground: nothing to click through and skip (so real usage exercises it
// same as always), but an accidental brush of the icon can't trigger it —
// only a deliberate, sustained press can.
const HOLD_MS = 900; // keep in sync with the clear-cache-hold-ring animation duration in tailwind.config.ts
const RING_CIRCUMFERENCE = 2 * Math.PI * 17; // keep in sync with the ring's r=17 below and its stroke-dashoffset keyframe
const MIN_OVERLAY_MS = 1700;
const HARD_CAP_MS = 4000;

interface OverlayOrigin {
  x: number;
  y: number;
  maxRadius: number;
}

export default function ClearCacheButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const holdTimerRef = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [overlayOrigin, setOverlayOrigin] = useState<OverlayOrigin | null>(null);

  const cancelHold = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHolding(false);
  };

  const triggerClear = async () => {
    // The circle below grows from wherever this button actually sits on
    // screen, so it has to be measured at trigger time rather than
    // hardcoded — this button lives in a shared header rendered at
    // different positions/sizes across breakpoints.
    const rect = buttonRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : 0;
    // Distance to the farthest viewport corner from that point, so the
    // circle is guaranteed to have fully enveloped the screen (not just
    // gotten close) by the time its animation ends, regardless of where
    // the button is positioned.
    const maxRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    setOverlayOrigin({ x, y, maxRadius });
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

  const startHold = () => {
    if (clearing || holdTimerRef.current !== null) return;
    setHolding(true);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      setHolding(false);
      void triggerClear();
    }, HOLD_MS);
  };

  // Keyboard users get the same hold gesture via Space/Enter — pointer
  // events alone would leave them with no way to trigger this at all.
  // e.repeat guards against the key's own auto-repeat restarting the timer
  // on every repeated keydown while held.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.repeat) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      startHold();
    }
  };
  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") cancelHold();
  };

  return (
    <>
      <Tooltip label="Hold to clear cache & reload" side="bottom">
        <button
          ref={buttonRef}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onContextMenu={(e) => e.preventDefault()}
          disabled={clearing}
          aria-label="Hold to clear cache and reload"
          className={`relative select-none rounded-lg p-1.5 disabled:opacity-50 ${
            holding ? "text-accent-low" : "text-neutral-500 hover:bg-surface-muted"
          }`}
        >
          <RefreshCw size={18} />
          {holding && (
            <svg
              className="pointer-events-none absolute -inset-1.5 -rotate-90"
              viewBox="0 0 40 40"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="20"
                cy="20"
                r="17"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                className="animate-clear-cache-hold-ring"
              />
            </svg>
          )}
        </button>
      </Tooltip>
      {clearing && overlayOrigin && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black px-6 text-center animate-clear-cache-circle-in"
          style={
            {
              "--origin-x": `${overlayOrigin.x}px`,
              "--origin-y": `${overlayOrigin.y}px`,
              "--max-radius": `${overlayOrigin.maxRadius}px`,
            } as React.CSSProperties
          }
        >
          <p
            className="text-3xl font-black uppercase text-neutral-100 sm:text-5xl animate-clear-cache-heading-in"
            style={{ textShadow: "0 0 24px rgba(239,68,68,0.45)" }}
          >
            Deleting all data
          </p>
          <p className="max-w-xs text-sm text-neutral-400 sm:text-base animate-clear-cache-subtext-in">
            You will be forced logged out. Please log back in to continue.
          </p>
        </div>
      )}
    </>
  );
}
