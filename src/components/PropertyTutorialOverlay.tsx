"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Volume2, VolumeX, X } from "lucide-react";
import { PROPERTY_TUTORIAL_STEPS, type PropertyTutorialStep } from "@/lib/propertyTutorial";
import { waitForElement } from "@/lib/tutorial";
import {
  setPropertyTutorialCompleted,
  getPropertyTutorialVoiceEnabled,
  setPropertyTutorialVoiceEnabled,
} from "@/lib/storage";
import { inflateRect, type Rect } from "@/lib/tutorialMask";
import TutorialVoiceWave from "./TutorialVoiceWave";

// Gap between the spotlighted element and the glow ring around it, in px.
// Same value as TutorialOverlay.tsx.
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

// Visually and behaviorally a sibling of TutorialOverlay.tsx (same
// spotlight glow over a fully live page + Escape-to-skip + draggable HUD +
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
//
// Round "P": this tour now runs the same narration preflight the main tour
// has had since round "O" (see hasNarration/TutorialOverlay.tsx). It was
// missing here, and the consequence was worse than it looks: this component
// renders its title/body ONLY into an sr-only aria-live region, so a step
// with no recorded clip is not merely quiet, it is completely blank - a
// glowing control and no words anywhere. Seven of these
// sixteen steps were in that state (property-sync-actions, add-property,
// example-edit, example-status-dropdown, example-add-part, example-add-task,
// replay-tour). Nine steps that talk beat sixteen where seven say nothing.
export default function PropertyTutorialOverlay(props: Props) {
  const [steps, setSteps] = useState<PropertyTutorialStep[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      PROPERTY_TUTORIAL_STEPS.map(async (s) => {
        try {
          const res = await fetch(`/audio/property/${s.id}.mp3`, { method: "HEAD" });
          return res.ok;
        } catch {
          // "I couldn't ask" must never be read as "it isn't there" - one
          // flaky request would otherwise gut the whole tour.
          return true;
        }
      })
    ).then((present) => {
      if (cancelled) return;
      const narratable = PROPERTY_TUTORIAL_STEPS.filter((_, i) => present[i]);
      // Nothing present at all means the requests failed, not that the audio
      // is missing - fall back to the full list so the customer gets the old
      // behaviour rather than an empty tour.
      setSteps(narratable.length ? narratable : PROPERTY_TUTORIAL_STEPS);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!steps) return null;
  return <PropertyTutorialOverlayInner {...props} steps={steps} />;
}

// Split out so the step list is final before any of the [stepIndex]-keyed
// effects below ever run - same reasoning as TutorialOverlay.tsx's wrapper:
// stepIndex sits at 0 while an async list resolves, so effects keyed on it
// would never re-fire once the list landed and step one would never speak.
function PropertyTutorialOverlayInner({
  exampleReceivedCount,
  onClose,
  steps,
}: Props & { steps: PropertyTutorialStep[] }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  // Whether narration is actually playing right now - drives
  // TutorialVoiceWave on the welcome step. Ported over from
  // TutorialOverlay.tsx, which has had this since the sound bar landed;
  // this tour never needed it until the waveform arrived. Keyed off the
  // real <audio> element's play/pause/ended events rather than "is this the
  // active step," so mute/unmute and a clip simply finishing both settle
  // the trace honestly.
  const [speaking, setSpeaking] = useState(false);
  // The spotlighted element's own computed border-radius - see
  // TutorialOverlay.tsx's identical field for the full rationale.
  const [targetRadius, setTargetRadius] = useState<string>("0.75rem");
  const targetElRef = useRef<HTMLElement | null>(null);
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
  // `steps` arrives already narrowed and frozen by the wrapper above.
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
  // for the main tour: no glow is drawn, and the narration plays over the
  // ordinary page rather than pointing at something that isn't there.
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
    setSpeaking(false);
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

    // Drives TutorialVoiceWave on the welcome step - see the `speaking`
    // state above. The stepIndexRef guard matters because these listeners
    // outlive the step that registered them: a clip that gets pause()d
    // because the customer already moved on must not clear the flag for
    // whatever step is showing now.
    const onPlay = () => {
      if (stepIndexRef.current === index) setSpeaking(true);
    };
    const onPauseOrEnd = () => {
      if (stepIndexRef.current === index) setSpeaking(false);
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPauseOrEnd);
    audio.addEventListener("ended", onPauseOrEnd);

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

  // Derived from position rather than read off the step: the step that used
  // to carry "Finish tour" (wrap-up) can now be dropped by the preflight, so
  // whichever step ends up last has to say it.
  const isLastStep = stepIndex === steps.length - 1;
  const nextLabel = isLastStep ? "Finish tour" : step.nextLabel ?? "Next";
  const audioSupported = typeof window !== "undefined" && typeof Audio !== "undefined";
  const isFirstStep = stepIndex === 0;

  // Where the glow rings go - see TutorialOverlay.tsx's identical block.
  // The dimmed/blurred bands that used to surround this are gone; the page
  // stays fully live and fully legible underneath the tour.
  const glowRect = rect ? inflateRect(rect, PAD) : null;

  return createPortal(
    // pointer-events-none is load-bearing here too, same reason as
    // TutorialOverlay.tsx — see that file's comment.
    <div className="pointer-events-none fixed inset-0 z-[200] outline-none">
      {/* No visible dialog box - see TutorialOverlay.tsx's identical live
          region for the full rationale. */}
      <div className="sr-only" aria-live="polite">
        {step.title}. {step.body}
      </div>
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

      {/* The voice waveform panel - the welcome step only, and the only step
          in this tour with showSoundBar set. Same placement, same rationale,
          and the same "outside the HUD pill on purpose" reasoning as
          TutorialOverlay.tsx's identical block; see TutorialVoiceWave.tsx. */}
      {step.showSoundBar && <TutorialVoiceWave speaking={speaking && voiceEnabled} />}

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
