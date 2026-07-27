"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX } from "lucide-react";
import { PROPERTY_TUTORIAL_STEPS } from "@/lib/propertyTutorial";
import { waitForElement } from "@/lib/tutorial";
import {
  setPropertyTutorialCompleted,
  getPropertyTutorialVoiceEnabled,
  setPropertyTutorialVoiceEnabled,
} from "@/lib/storage";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Gap between the spotlighted element and both the cutout ring and the
// masking bands around it, in px. Same value as TutorialOverlay.tsx.
const PAD = 8;

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
// bands + spotlight ring + callout card + focus trap + Escape-to-skip), kept
// as a separate component rather than a shared one: the main tour is driven
// by tab/sidebar state on the single-page app, this one runs entirely on
// the standalone /property page, and duplicating the ~150 lines of
// presentational JSX was judged lower-risk this round than refactoring the
// already-shipped, working main tutorial to share it. Adds one thing the
// main tour doesn't have: an optional read-aloud of each step, using a
// prerecorded audio clip (see playStepAt() below) — genuinely optional and
// off with one tap, never required for the tour to make sense.
export default function PropertyTutorialOverlay({ exampleReceivedCount, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const targetElRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevReceivedRef = useRef(exampleReceivedCount);
  // Tracks which step index has already had playStepAt() called for it —
  // see the click-handler-driven calls below. Lets the fallback effect
  // (further down) tell "already played synchronously by this tap" apart
  // from "genuinely hasn't been played yet" without playing the same line
  // twice.
  const lastSpokenIndexRef = useRef(-1);
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
    setStepIndex((i) => {
      if (i >= steps.length - 1) {
        setPropertyTutorialCompleted("finished");
        audioRef.current?.pause();
        onClose();
        return i;
      }
      const next = i + 1;
      // Play synchronously, right here inside the tap that's advancing the
      // tour — not deferred into an effect that fires after React commits
      // the re-render. Mobile browsers (Safari/WebKit in particular, and
      // increasingly Chrome on Android) only let HTMLMediaElement.play()
      // actually produce sound when the call happens as part of handling a
      // real user gesture; once it's pushed into a useEffect reacting to
      // stepIndex changing, the browser no longer credits it as
      // gesture-triggered and the play() promise just rejects — which is
      // exactly why the old speechSynthesis version of this played on
      // desktop but was silent on mobile.
      if (voiceEnabled) playStepAt(next);
      return next;
    });
  };

  // Find (and re-find) this step's spotlight target whenever the step
  // changes. No tab/sidebar to wait on first (unlike TutorialOverlay), but
  // the target can still legitimately not exist yet on the very first
  // render (or ever, if the customer deleted the example mid-tour) —
  // waitForElement's timeout-then-null handles that the same way it does
  // for the main tour: the card just goes centered with a full dim, no hole.
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
        // Guarantees the spotlighted element is actually on screen rather
        // than assuming it already is — on a short mobile viewport a target
        // lower on the page can sit below the fold, especially once a step
        // like "log-receipt" grows its own row taller (see the
        // ResizeObserver below); without this, the customer would need to
        // already know to scroll before they could reach a control the
        // tour is telling them to tap.
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // A spotlighted target's own content can change height while the
        // step is showing — e.g. "log-receipt" targets the whole part row,
        // which grows taller the instant the customer taps the receipt
        // icon and the quantity/confirm panel expands inside it. Window
        // resize/scroll listeners (below) don't catch that, since nothing
        // about the window changed, so watch the element itself and keep
        // the hole glued to its real, current size — otherwise controls
        // that appear past the old hole boundary sit unclickable under the
        // dimmed, pointer-events-auto backdrop.
        resizeObserver = new ResizeObserver(() => {
          if (!targetElRef.current) return;
          setRect(targetElRef.current.getBoundingClientRect());
          // Re-center after a resize too — the same short-viewport case
          // above, but triggered by the row growing rather than the step
          // changing: the newly-revealed quantity input/confirm button can
          // land past the bottom edge of the screen the instant the panel
          // opens, on a phone where the row was already lower on the page.
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

  useEffect(() => {
    cardRef.current?.focus();
  }, [stepIndex]);

  // Recorded narration lives in public/audio/property/<step id>.mp3 — one
  // clip per step, generated the same way as the main tour's (see the
  // comment above TUTORIAL_STEPS in tutorial.ts). Named by id rather than
  // stored as a field on each step, so adding a new step just means
  // dropping in a matching file; nothing here needs updating.
  // Returns the Audio element it created (or null if it didn't play one) so
  // callers that need to clean up after *this specific* clip — see the
  // fallback effect below — can do so without going back through the
  // shared audioRef, which may have already moved on to a later step's
  // clip by the time that cleanup runs.
  const playStepAt = (index: number): HTMLAudioElement | null => {
    if (typeof window === "undefined" || typeof Audio === "undefined") return null;
    const target = steps[index];
    if (!target) return null;
    audioRef.current?.pause();
    const audio = new Audio(`/audio/property/${target.id}.mp3`);
    audioRef.current = audio;
    // A missing file and a browser declining to autoplay both reject this
    // promise — neither is treated as fatal, same "never a hard
    // requirement" spirit the old speechSynthesis path had: the tour just
    // runs silently for that step rather than throwing.
    audio.play().catch((err) => {
      console.warn(`Tutorial narration failed for step "${target.id}":`, err);
    });
    lastSpokenIndexRef.current = index;
    return audio;
  };

  // Fallback for the one path that can never be gesture-driven: the very
  // first step, when the tour auto-opens on mount for a brand-new empty
  // property list rather than from a tap on "Take the property tour." Every
  // other step transition is already played synchronously inside its own
  // click handler (advance(), toggleVoice() below) — this effect only
  // plays when that hasn't already happened for the current step, so
  // nothing plays twice. Unlike the old speechSynthesis version there's no
  // async voice list to wait on here, so this just plays immediately.
  useEffect(() => {
    if (!voiceEnabled || typeof window === "undefined") return;
    if (lastSpokenIndexRef.current === stepIndex) return;
    const audio = playStepAt(stepIndex);
    // Pause the exact clip this effect started, not "whatever audioRef
    // currently points at" — see TutorialOverlay.tsx's identical comment
    // for the full story: pausing the ref instead was cutting every step's
    // narration off almost immediately after it started.
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
      // Same gesture-synchronicity reasoning as advance() above — play the
      // step already on screen right inside this tap, instead of waiting
      // for the effect above to pick it up a render later.
      playStepAt(stepIndex);
    } else {
      audioRef.current?.pause();
    }
  };

  const onCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !cardRef.current) return;
    const focusable = cardRef.current.querySelectorAll<HTMLElement>("button");
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

  if (typeof document === "undefined") return null;

  const nextLabel = step.nextLabel ?? "Next";
  const cardNearTop = rect ? rect.top > window.innerHeight / 2 : false;
  const audioSupported = typeof window !== "undefined" && typeof Audio !== "undefined";

  return createPortal(
    // pointer-events-none is load-bearing here too, same reason as
    // TutorialOverlay.tsx — see that file's comment.
    <div className="pointer-events-none fixed inset-0 z-[200]">
      {rect ? (
        <>
          <div
            className="pointer-events-auto fixed left-0 right-0 top-0 bg-black/70 transition-all duration-200"
            style={{ height: Math.max(0, rect.top - PAD) }}
          />
          <div
            className="pointer-events-auto fixed bottom-0 left-0 right-0 bg-black/70 transition-all duration-200"
            style={{ top: rect.top + rect.height + PAD }}
          />
          <div
            className="pointer-events-auto fixed bg-black/70 transition-all duration-200"
            style={{ top: rect.top - PAD, left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 }}
          />
          <div
            className="pointer-events-auto fixed bg-black/70 transition-all duration-200"
            style={{ top: rect.top - PAD, left: rect.left + rect.width + PAD, right: 0, height: rect.height + PAD * 2 }}
          />
          <div
            className="pointer-events-none fixed rounded-lg ring-2 ring-white/90 animate-tutorial-ring-pulse transition-all duration-200"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }}
          />
        </>
      ) : (
        <div className="pointer-events-auto fixed inset-0 bg-black/70" />
      )}

      <div
        className={`pointer-events-auto fixed inset-x-0 flex justify-center px-4 ${
          !rect ? "inset-y-0 items-center" : cardNearTop ? "top-[76px]" : "bottom-24"
        }`}
      >
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label={step.title}
          tabIndex={-1}
          onKeyDown={onCardKeyDown}
          className="w-full max-w-sm animate-tutorial-card-in rounded-xl2 bg-white p-4 shadow-card outline-none"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-neutral-900">{step.title}</p>
            {audioSupported && (
              <button
                onClick={toggleVoice}
                aria-label={voiceEnabled ? "Mute the tour's voice" : "Unmute the tour's voice"}
                className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-surface-muted hover:text-neutral-600"
              >
                {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{step.body}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              onClick={() => finish("skipped")}
              className="text-xs font-medium text-neutral-400 hover:text-neutral-600"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-400">
                {stepIndex + 1}/{steps.length}
              </span>
              <button
                onClick={advance}
                className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                {nextLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
