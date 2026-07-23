"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
// How long the full-screen warning sits up, cancelable, before anything is
// actually touched. This used to be a fixed, un-cancelable 1.7s "let the
// animation play out" pause with the real clearAppCache() already running
// underneath it — a customer who'd changed their mind mid-reveal had no way
// to stop it. Now nothing destructive happens until this whole window
// elapses without a tap, so "the words disappear too quickly" and "I can't
// change my mind" are the same fix: give the screen more time, and make
// that time genuinely cancelable rather than just a longer forced wait.
const GRACE_MS = 4000;
const HARD_CAP_MS = 4000; // safety net for the actual clear once grace expires — see executeClear

interface OverlayOrigin {
  x: number;
  y: number;
  maxRadius: number;
}

export default function ClearCacheButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const holdTimerRef = useRef<number | null>(null);
  const graceTimerRef = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  // "confirming": the cancelable warning screen is up, nothing has happened
  // yet. "clearing": the grace window elapsed without a cancel — the actual
  // clear is now running and this is no longer interruptible.
  const [overlayPhase, setOverlayPhase] = useState<"confirming" | "clearing" | null>(null);
  const [overlayOrigin, setOverlayOrigin] = useState<OverlayOrigin | null>(null);

  const cancelHold = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHolding(false);
  };

  const clearGraceTimer = () => {
    if (graceTimerRef.current !== null) {
      window.clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  };

  // Only reachable once the grace window has already elapsed — this is the
  // point of no return, so cancelWarning below can no longer stop it.
  const executeClear = async () => {
    setOverlayPhase("clearing");
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
      // Race the actual clear (plus a brief settle pause — the customer
      // already had the full GRACE_MS window to watch this coming, so this
      // is just enough for the browser to finish painting, not another
      // reveal) against a hard cap, so a customer can never get stuck
      // staring at this screen forever — not from the settle pause, and
      // not from some other browser API call inside clearAppCache() that
      // might hang for an unrelated reason on some device. Whatever hasn't
      // finished clearing by the cap just gets left for next time;
      // reloading either way is strictly better than a frozen screen.
      //
      // This used to be a chained requestAnimationFrame delay, which was a
      // real bug, not just a theoretical one: rAF callbacks are suspended
      // entirely while a tab is backgrounded/not visible (confirmed live —
      // this got stuck indefinitely in a background tab, since the browser
      // never scheduled the frames to resolve the promise). setTimeout
      // doesn't have that failure mode: background tabs throttle it, they
      // don't suspend it, so it always eventually fires.
      await Promise.race([
        clearAppCache().then(() => new Promise((resolve) => setTimeout(resolve, 50))),
        new Promise((resolve) => setTimeout(resolve, HARD_CAP_MS)),
      ]);
    } finally {
      window.location.reload();
    }
  };

  const showWarning = () => {
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
    setOverlayPhase("confirming");
    graceTimerRef.current = window.setTimeout(() => {
      graceTimerRef.current = null;
      void executeClear();
    }, GRACE_MS);
  };

  // Backs all the way out with nothing touched: no camera stop, no cache
  // clear, no reload. Only does anything while phase is "confirming" —
  // once executeClear has taken over there's no undoing it.
  const cancelWarning = () => {
    clearGraceTimer();
    setOverlayPhase((prev) => (prev === "confirming" ? null : prev));
    setOverlayOrigin((prev) => (prev !== null ? null : prev));
  };

  useEffect(() => {
    if (overlayPhase !== "confirming") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelWarning();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayPhase]);

  // Belt-and-suspenders alongside the unmount cleanup below: if this
  // component itself ever unmounts mid-grace-window (shouldn't happen for
  // a header icon, but cheap insurance), don't leave a dangling timer that
  // fires executeClear against a torn-down component.
  useEffect(() => clearGraceTimer, []);

  const startHold = () => {
    if (overlayPhase || holdTimerRef.current !== null) return;
    setHolding(true);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      setHolding(false);
      showWarning();
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
          disabled={!!overlayPhase}
          aria-label="Hold to clear cache and reload"
          className={`relative select-none rounded-lg p-1.5 disabled:opacity-50 ${
            // A shade of red at rest (this is a destructive "wipe local data"
            // action, so the standing red hints it isn't the ordinary
            // refresh it resembles), deepening to the full accent red while
            // actively held.
            holding ? "text-accent-low" : "text-red-400 hover:bg-red-50 hover:text-accent-low"
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
      {/* Portaled straight to <body> rather than rendered in place: this
          button lives inside the app's <header>, which has backdrop-blur
          for its frosted-glass look. Per the CSS spec, an element with a
          backdrop-filter (like transform/filter/perspective) becomes the
          containing block for any position:fixed descendant — so without
          the portal, "fixed inset-0" below would resolve against the
          header's own box instead of the viewport, and the reveal would
          stay pinned to the header strip instead of covering the screen. */}
      {overlayPhase &&
        overlayOrigin &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role={overlayPhase === "confirming" ? "alertdialog" : undefined}
            aria-label={overlayPhase === "confirming" ? "Clearing cache — tap anywhere to cancel" : undefined}
            onClick={overlayPhase === "confirming" ? cancelWarning : undefined}
            className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black px-6 text-center animate-clear-cache-circle-in ${
              overlayPhase === "confirming" ? "cursor-pointer" : ""
            }`}
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
            {/* Only shown during the cancelable window — once executeClear
                takes over there's nothing left to change your mind about,
                so the hint (and the countdown that promised it) disappears
                along with the ability it was describing. */}
            {overlayPhase === "confirming" && (
              <>
                <p className="mt-1 animate-clear-cache-cancel-hint-in text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Tap anywhere to cancel
                </p>
                <div className="absolute bottom-0 left-0 h-1 bg-accent-low/70 animate-clear-cache-grace-countdown" />
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
