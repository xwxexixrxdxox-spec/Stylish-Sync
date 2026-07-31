"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Volume2, VolumeX, X } from "lucide-react";
import { PROPERTY_TUTORIAL_STEPS } from "@/lib/propertyTutorial";
import { waitForElement } from "@/lib/tutorial";
import {
  setPropertyTutorialCompleted,
  getPropertyTutorialVoiceEnabled,
  setPropertyTutorialVoiceEnabled,
} from "@/lib/storage";
import { computeMaskBands, inflateRect, type Rect } from "@/lib/tutorialMask";

// Gap between the spotlighted element and both the glow ring and the
// masking bands around it, in px. Same value as TutorialOverlay.tsx.
const PAD = 4;
// Same drag-vs-tap distinction as TutorialOverlay.tsx's HUD.
const DRAG_THRESHOLD_PX = 4;

interface Props {
  // Live quantityReceived of the seeded example part, re-passed on every
  // PropertyManager render — watched below purely to auto-advance the
  // "log-receipt" step the instant the customer actually logs one, the
  // same self-resolving idea as the main tutorial's account-gear/
  // google-signin steps (see TutorialOverlay.tsx), just driven by a prop
  // instead of local state since PropertyManager owns the data.
  exampleReceivedCount: number;
  onClose: () => void;
}

// Visually and behaviorally a sibling of TutorialOverlay.tsx (same masking
// bands + spotlight glow + focus trap + Escape-to-skip + draggable HUD +
// back arrow), kept as a separate component rather than a shared one: the
// main tour is driven by tab/sidebar state on the single-page app, this
// one runs entirely on the standalone /property page, and duplicating the
// JSX was judged lower-risk than refactoring the already-shipped, working
// main tutorial to share it. Opened on demand only (the existing "↻ Take
// the property tour" link/button in PropertyManager.tsx) - it no longer
// autoplays on a brand-new empty property list.
//
// This round ("O") brought it up to the same engine baseline as the main
// tour: a HUD back arrow, drag-to-reposition, and no more auto-advance the
// instant a clip finishes playing - narration alone no longer moves the
// tour forward, only a real tap (or, for "log-receipt", the literal real
// action that step is asking for) does. Its own step content (still the
// pre-seeded-example walkthrough) is unchanged this round - see
// propertyTutorial.ts's own comment for what's still queued for a fuller,
// hands-on rework matching the main tour's Part 1/2 redesign.
export default function PropertyTutorialOverlay({ exampleReceivedCount, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  // The spotlighted element's own computed border-radius - see
  // TutorialOverlay.tsx's identical field for the full rationale.
  const [targetRadius, setTargetRadius] = useState<string>("0.75rem");
  const targetElRef = useRef<HTMLElement | null>(null);
  // Wraps every focusable control the corner HUD renders (mute, back,
  // next, skip) - queried by onOverlayKeyDown below for the Tab focus trap.
  const overlayRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevReceivedRef = useRef(exampleReceivedCount);
  // Tracks which step index has already had playStepAt() called for it —
  // see the click-handler-driven calls below.
  const lastSpokenIndexRef = useRef(-1);
  // Guards against advancing twice for the same step - see
  // TutorialOverlay.tsx's identical ref for the full rationale.
  const hasAdvancedRef = useRef(false);
  useEffect(() => {
    hasAdvancedRef.current = false;
  }, [stepIndex]);
  const stepIndexRef = useRef(0);
  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);
  const [hudPos, setHudPos] = useState<{ left: number; top: number } | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    dragging: boolean;
  } | null>(null);
  const steps = PROPERTY_TUTORIAL_STEPS;
  const step = steps[stepIndex];

  useEffect(() => {
    setVoiceEnabled(getPropertyTutorialVoiceEnabled());
  }, []);

  const finish = (reason: "finished" | "skipped") => {
    setPropertyTutorialCompleted(reason);
    audioRef.current?.pause();
    onClose();
  };

  const advance = () => {
    if (hasAdvancedRef.current) return;
    hasAdvancedRef.current = true;
    setStepIndex((i) => {
      if (i >= steps.length - 1) {
        setPropertyTutorialCompleted("finished");
        audioRef.current?.pause();
        onClose();
        return i;
      }
      const next = i + 1;
      // Play synchronously, right here inside the tap that's advancing the
      // tour — see TutorialOverlay.tsx's identical comment for the mobile
      // autoplay-gesture rationale.
      if (voiceEnabled) playStepAt(next);
      return next;
    });
  };

  // Steps back one - see TutorialOverlay.tsx's identical goBack for the
  // full rationale.
  const goBack = () => {
    if (hasAdvancedRef.current) return;
    hasAdvancedRef.current = true;
    setStepIndex((i) => {
      if (i <= 0) {
        hasAdvancedRef.current = false;
        return i;
      }
      const prev = i - 1;
      if (voiceEnabled) playStepAt(prev);
      return prev;
    });
  };

  // Find (and re-find) this step's spotlight target whenever the step
  // changes. No tab/sidebar to wait on first (unlike TutorialOverlay), but
  // the target can still legitimately not exist yet on the very first
  // render (or ever, if the customer deleted the example mid-tour) —
  // waitForElement's timeout-then-null handles that the same way it does
  // for the main tour: everything just stays fully blurred, no hole.
  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    setRect(null);
    targetElRef.current = null;
    if (!step.targetSelector) return;
    waitForElement(step.targetSelector).then((el) => {
      if (cancelled) return;
      targetElRef.current = el;
      if (el) {
        setRect(el.getBoundingClientRect());
        setTargetRadius(window.getComputedStyle(el).borderRadius || "0.75rem");
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        resizeObserver = new ResizeObserver(() => {
          if (!targetElRef.current) return;
          setRect(targetElRef.current.getBoundingClientRect());
          targetElRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
        });
        resizeObserver.observe(el);
      }
    });
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Keep the spotlight glued to its target through resize/scroll, and catch
  // late layout shifts a beat after it first appears. Same as
  // TutorialOverlay.tsx.
  useEffect(() => {
    const recompute = () => {
      if (targetElRef.current) setRect(targetElRef.current.getBoundingClientRect());
    };
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    const settleTimer = window.setTimeout(recompute, 250);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
      window.clearTimeout(settleTimer);
    };
  }, [stepIndex]);

  // The one self-resolving step: logging a real receipt on the example part
  // (a genuine action the customer takes on the real "Log a receipt"
  // control this step is spotlighting) moves the tour on by itself, same
  // spirit as the main tour advancing itself when the customer actually
  // signs into Google rather than making them also tap Next afterward.
  useEffect(() => {
    if (step.id === "log-receipt" && exampleReceivedCount > prevReceivedRef.current) {
      advance();
    }
    prevReceivedRef.current = exampleReceivedCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exampleReceivedCount]);

  // Escape backs all the way out, same as "Skip tour" — matches
  // TutorialOverlay.tsx / ClearCacheButton's existing Escape-to-cancel
  // pattern.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish("skipped");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send focus into the tour's own overlay each time a new step appears -
  // see TutorialOverlay.tsx's identical effect for the full rationale.
  useEffect(() => {
    overlayRef.current?.focus();
  }, [stepIndex]);

  // Recorded narration lives in public/audio/property/<step id>.mp3 — one
  // clip per step, generated the same way as the main tour's. Named by id
  // rather than stored as a field on each step, so adding a new step just
  // means dropping in a matching file; nothing here needs updating.
  const playStepAt = (index: number): HTMLAudioElement | null => {
    if (typeof window === "undefined" || typeof Audio === "undefined") return null;
    const target = steps[index];
    if (!target) return null;
    audioRef.current?.pause();
    const audio = new Audio(`/audio/property/${target.id}.mp3`);
    audioRef.current = audio;
    // A missing file and a browser declining to autoplay both reject this
    // promise — neither is treated as fatal: the tour just sits on that
    // step until the customer taps the corner HUD's manual Next, rather
    // than throwing or getting stuck silently forever. AbortError is
    // excluded from the warning entirely - see TutorialOverlay.tsx's
    // identical comment.
    audio.play().catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.warn(`Tutorial narration failed for step "${target.id}":`, err);
    });
    lastSpokenIndexRef.current = index;

    return audio;
  };

  // Fallback for the one path that can never be gesture-driven: the very
  // first step, when the tour opens (a tap on "Take the property tour").
  // Every other step transition is already played synchronously inside its
  // own click handler (advance(), goBack(), toggleVoice() below) — this
  // effect only plays when that hasn't already happened for the current
  // step, so nothing plays twice.
  useEffect(() => {
    if (!voiceEnabled || typeof window === "undefined") return;
    if (lastSpokenIndexRef.current === stepIndex) return;
    const audio = playStepAt(stepIndex);
    return () => {
      audio?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, voiceEnabled]);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setPropertyTutorialVoiceEnabled(next);
    if (next) {
      playStepAt(stepIndex);
    } else {
      audioRef.current?.pause();
    }
  };

  // A minimal focus trap across the corner HUD's own buttons - see
  // TutorialOverlay.tsx's identical handler for the full rationale.
  const onOverlayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !overlayRef.current) return;
    const focusable = overlayRef.current.querySelectorAll<HTMLElement>("button");
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Drag-to-reposition for the corner HUD - see TutorialOverlay.tsx's
  // identical handlers for the full rationale.
  const onHudPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const hud = hudRef.current;
    if (!hud) return;
    const rect = hud.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
      dragging: false,
    };
  };
  const onHudPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!drag.dragging) {
      drag.dragging = true;
      hudRef.current?.setPointerCapture(e.pointerId);
    }
    const hud = hudRef.current;
    const width = hud?.offsetWidth ?? 0;
    const height = hud?.offsetHeight ?? 0;
    const nextLeft = Math.min(Math.max(4, drag.origLeft + dx), window.innerWidth - width - 4);
    const nextTop = Math.min(Math.max(4, drag.origTop + dy), window.innerHeight - height - 4);
    setHudPos({ left: nextLeft, top: nextTop });
  };
  const onHudPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (drag?.dragging) hudRef.current?.releasePointerCapture(e.pointerId);
    dragStateRef.current = null;
  };

  if (typeof document === "undefined") return null;

  const nextLabel = step.nextLabel ?? "Next";
  const audioSupported = typeof window !== "undefined" && typeof Audio !== "undefined";
  const isFirstStep = stepIndex === 0;

  // Same blur-mask approach as TutorialOverlay.tsx - see that file's
  // comment above its own maskBands for the full rationale. This tour only
  // ever has one thing in focus at a time (no focusSelectors equivalent
  // here yet), so maskHoles is just the current glow target, but
  // computeMaskBands handles that as the single-hole case automatically.
  const glowRect = rect ? inflateRect(rect, PAD) : null;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
  const maskBands = computeMaskBands(glowRect ? [glowRect] : [], viewportWidth, viewportHeight);

  return createPortal(
    // pointer-events-none is load-bearing here too, same reason as
    // TutorialOverlay.tsx — see that file's comment. tabIndex=-1 +
    // outline-none makes this div the tour's focus landing spot.
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="pointer-events-none fixed inset-0 z-[200] outline-none"
      onKeyDown={onOverlayKeyDown}
    >
      {/* No visible dialog box - see TutorialOverlay.tsx's identical live
          region for the full rationale. */}
      <div className="sr-only" aria-live="polite">
        {step.title}. {step.body}
      </div>
      {/* Blurred + dimmed bands cover everything outside the current
          target - see TutorialOverlay.tsx's identical block for the full
          rationale. Kept light (a quarter of the original blur strength)
          so the rest of the page stays legible behind it. */}
      {maskBands.map((band, i) => (
        <div
          key={i}
          className="pointer-events-auto fixed bg-black/45 backdrop-blur-[3px] transition-all duration-200"
          style={{ top: band.top, left: band.left, width: band.width, height: band.height }}
        />
      ))}
      {glowRect && (
        <>
          {/* The "quest marker" glow, hugging the real target's own shape
              (targetRadius) - see TutorialOverlay.tsx's identical pair of
              divs for the full rationale. */}
          <div
            className="pointer-events-none fixed ring-2 ring-amber-300/70 animate-tutorial-glow-ping"
            style={{
              top: glowRect.top,
              left: glowRect.left,
              width: glowRect.width,
              height: glowRect.height,
              borderRadius: targetRadius,
            }}
          />
          <div
            className="pointer-events-none fixed ring-2 ring-amber-300 animate-tutorial-glow-pulse transition-all duration-200"
            style={{
              top: glowRect.top,
              left: glowRect.left,
              width: glowRect.width,
              height: glowRect.height,
              borderRadius: targetRadius,
            }}
          />
        </>
      )}

      {/* Corner HUD - draggable (see onHudPointerDown/Move/Up above), now
          with a back arrow alongside mute/next/skip. */}
      <div
        ref={hudRef}
        onPointerDown={onHudPointerDown}
        onPointerMove={onHudPointerMove}
        onPointerUp={onHudPointerUp}
        onPointerCancel={onHudPointerUp}
        className={`pointer-events-auto fixed z-[201] flex touch-none select-none items-center gap-0.5 rounded-full bg-neutral-900/80 px-2 py-1 text-white shadow-card backdrop-blur animate-label-in ${
          hudPos ? "cursor-grab active:cursor-grabbing" : "right-3 top-3 cursor-grab active:cursor-grabbing"
        }`}
        style={hudPos ? { left: hudPos.left, top: hudPos.top } : undefined}
      >
        {audioSupported && (
          <button
            onClick={toggleVoice}
            aria-label={voiceEnabled ? "Mute the tour's voice" : "Unmute the tour's voice"}
            className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
          >
            {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        )}
        <span className="px-1 text-[11px] tabular-nums text-white/70">
          {stepIndex + 1}/{steps.length}
        </span>
        <button
          onClick={goBack}
          disabled={isFirstStep}
          aria-label="Previous step"
          className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={advance}
          aria-label={nextLabel}
          className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={() => finish("skipped")}
          aria-label="Skip tour"
          className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
