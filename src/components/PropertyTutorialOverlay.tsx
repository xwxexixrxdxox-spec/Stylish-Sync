"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX, X } from "lucide-react";
import { PROPERTY_TUTORIAL_STEPS } from "@/lib/propertyTutorial";
import { waitForElement } from "@/lib/tutorial";
import {
  setPropertyTutorialCompleted,
  getPropertyTutorialVoiceEnabled,
  setPropertyTutorialVoiceEnabled,
} from "@/lib/storage";
import { computeMaskBands, inflateRect, type Rect } from "@/lib/tutorialMask";

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
// bands + spotlight glow + caption bubble + focus trap + Escape-to-skip),
// kept as a separate component rather than a shared one: the main tour is
// driven by tab/sidebar state on the single-page app, this one runs
// entirely on the standalone /property page, and duplicating the ~150
// lines of presentational JSX was judged lower-risk this round than
// refactoring the already-shipped, working main tutorial to share it. Both
// were reworked together from an original callout-card design to this
// game-style glow-and-voice one — see TutorialOverlay.tsx's top comment for
// the fuller rationale.
export default function PropertyTutorialOverlay({ exampleReceivedCount, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  // Measured height of the caption bubble - see TutorialOverlay.tsx's
  // identical field for the full rationale (the caption's own height
  // matters when deciding whether it can sit near the bottom without
  // covering a tall spotlight target).
  const [captionHeight, setCaptionHeight] = useState(90);
  const targetElRef = useRef<HTMLElement | null>(null);
  // Wraps every focusable control this step renders (the corner pill's
  // mute/skip buttons, the caption's own Next button) - queried by
  // onOverlayKeyDown below for the Tab focus trap.
  const overlayRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
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

  // Send focus into the caption bubble each time a new step appears - see
  // TutorialOverlay.tsx's identical effect for the full rationale.
  useEffect(() => {
    captionRef.current?.focus();
  }, [stepIndex]);

  // Keeps captionHeight in sync with the caption's real rendered height.
  // Brought over from TutorialOverlay.tsx's fix for the main tour's
  // "support" step (a tall spotlight target reaching into a bottom-anchored
  // caption's zone despite starting near the top) - this tour's own
  // "log-receipt" step has the same shape of risk, since its target row
  // grows taller the instant the quantity/confirm panel expands (see the
  // ResizeObserver effect above), so the same more-accurate placement check
  // applies here too rather than just the simpler rect.top heuristic.
  useEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    setCaptionHeight(el.getBoundingClientRect().height);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setCaptionHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
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
    // runs silently for that step rather than throwing. AbortError is
    // excluded from the warning entirely: it fires whenever this clip gets
    // superseded by a pause() call before it finished — the ordinary,
    // expected outcome of the customer advancing before narration wraps
    // up, not a real failure worth surfacing.
    audio.play().catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
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

  // A minimal focus trap across both the corner pill and the caption's own
  // Next button - see TutorialOverlay.tsx's identical handler for the full
  // rationale.
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

  if (typeof document === "undefined") return null;

  const nextLabel = step.nextLabel ?? "Next";
  // Same more-accurate placement check as TutorialOverlay.tsx - see the
  // captionHeight effect above for why this looks past just rect.top.
  const BOTTOM_CAPTION_CLEARANCE = 96; // px - matches bottom-24 below
  const captionNearTop = rect
    ? rect.top > window.innerHeight / 2 ||
      rect.top + rect.height + PAD > window.innerHeight - BOTTOM_CAPTION_CLEARANCE - captionHeight
    : false;
  const audioSupported = typeof window !== "undefined" && typeof Audio !== "undefined";

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
    // TutorialOverlay.tsx — see that file's comment.
    <div ref={overlayRef} className="pointer-events-none fixed inset-0 z-[200]" onKeyDown={onOverlayKeyDown}>
      {/* Blurred + dimmed bands cover everything outside the current
          target - see TutorialOverlay.tsx's identical block for the full
          rationale (blur rather than a flat dim, so the focused element
          reads as in-focus by contrast). */}
      {maskBands.map((band, i) => (
        <div
          key={i}
          className="pointer-events-auto fixed bg-black/45 backdrop-blur-md transition-all duration-200"
          style={{ top: band.top, left: band.left, width: band.width, height: band.height }}
        />
      ))}
      {glowRect && (
        <>
          {/* The "quest marker" glow - see TutorialOverlay.tsx's identical
              pair of divs for the full rationale. */}
          <div
            className="pointer-events-none fixed rounded-lg ring-2 ring-amber-300/70 animate-tutorial-glow-ping"
            style={{ top: glowRect.top, left: glowRect.left, width: glowRect.width, height: glowRect.height }}
          />
          <div
            className="pointer-events-none fixed rounded-lg ring-2 ring-amber-300 animate-tutorial-glow-pulse transition-all duration-200"
            style={{ top: glowRect.top, left: glowRect.left, width: glowRect.width, height: glowRect.height }}
          />
        </>
      )}

      {/* Minimal corner HUD - see TutorialOverlay.tsx's identical element
          for the full rationale. */}
      <div className="pointer-events-auto fixed right-3 top-3 z-[201] flex animate-label-in items-center gap-0.5 rounded-full bg-neutral-900/80 px-2 py-1 text-white shadow-card backdrop-blur">
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
          onClick={() => finish("skipped")}
          aria-label="Skip tour"
          className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {/* The caption bubble - see TutorialOverlay.tsx's identical element
          for the full rationale. */}
      <div
        className={`pointer-events-none fixed inset-x-0 flex justify-center px-4 ${
          !rect ? "inset-y-0 items-center" : captionNearTop ? "top-[76px]" : "bottom-24"
        }`}
      >
        <div
          ref={captionRef}
          role="dialog"
          aria-modal="true"
          aria-label={step.title}
          tabIndex={-1}
          className="pointer-events-auto w-full max-w-xs animate-tutorial-card-in rounded-2xl border border-amber-300/40 bg-neutral-900/90 p-3 text-white shadow-card outline-none backdrop-blur"
        >
          <p className="text-sm font-semibold text-white">{step.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/70">{step.body}</p>
          <div className="mt-2 flex justify-end">
            <button
              onClick={advance}
              className="rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-neutral-900 hover:bg-amber-200"
            >
              {nextLabel} ›
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
