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
// main tour doesn't have: an optional spoken read-aloud of each step,
// using the browser's own speech synthesis (see speak() below) — genuinely
// optional and off with one tap, never on without the customer's device
// supporting it in the first place.
export default function PropertyTutorialOverlay({ exampleReceivedCount, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const targetElRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const prevReceivedRef = useRef(exampleReceivedCount);
  const steps = PROPERTY_TUTORIAL_STEPS;
  const step = steps[stepIndex];

  useEffect(() => {
    setVoiceEnabled(getPropertyTutorialVoiceEnabled());
  }, []);

  const finish = (reason: "finished" | "skipped") => {
    setPropertyTutorialCompleted(reason);
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    onClose();
  };

  const advance = () => {
    setStepIndex((i) => {
      if (i >= steps.length - 1) {
        setPropertyTutorialCompleted("finished");
        if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
        onClose();
        return i;
      }
      return i + 1;
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
    setRect(null);
    targetElRef.current = null;
    if (!step.targetSelector) return;
    waitForElement(step.targetSelector).then((el) => {
      if (cancelled) return;
      targetElRef.current = el;
      if (el) setRect(el.getBoundingClientRect());
    });
    return () => {
      cancelled = true;
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

  // Picks the closest thing to a "soft female voice" the Web Speech API
  // actually exposes — it has no reliable gender field, so this is a
  // best-effort name match against common female-sounding system/browser
  // voices, falling back to whatever English voice is first available (and
  // ultimately to no voice override at all, which still speaks in the
  // browser's own default). Never a hard requirement: if speech synthesis
  // isn't supported at all, the tour is silent and otherwise unaffected.
  const pickVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
    if (!voices.length) return null;
    const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
    const pool = english.length ? english : voices;
    const hints = [
      "female", "samantha", "victoria", "zira", "susan", "karen", "moira",
      "tessa", "fiona", "aria", "jenny", "google us english", "google uk english female",
    ];
    return pool.find((v) => hints.some((h) => v.name.toLowerCase().includes(h))) ?? pool[0] ?? null;
  };

  const speakStep = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(`${step.title}. ${step.body}`);
    const voice = pickVoice(window.speechSynthesis.getVoices());
    if (voice) utter.voice = voice;
    utter.pitch = 1.05;
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
  };

  // Speaks the current step's card whenever it changes, as long as voice is
  // on. Voice lists load asynchronously in some browsers (empty on the
  // very first call), so this falls back to the voiceschanged event rather
  // than speaking with no voice override that one time.
  useEffect(() => {
    if (!voiceEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = speakStep;
    } else {
      speakStep();
    }
    return () => {
      window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, voiceEnabled]);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setPropertyTutorialVoiceEnabled(next);
    if (!next && typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
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
  const speechSupported = typeof window !== "undefined" && !!window.speechSynthesis;

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
            {speechSupported && (
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
