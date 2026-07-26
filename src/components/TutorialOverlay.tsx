"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX } from "lucide-react";
import { TUTORIAL_STEPS, waitForElement } from "@/lib/tutorial";
import {
  getCookieConsent,
  setTutorialCompleted,
  getTutorialVoiceEnabled,
  setTutorialVoiceEnabled,
} from "@/lib/storage";
import type { TabId } from "./BottomNav";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Gap between the spotlighted element and both the cutout ring and the
// masking bands around it, in px.
const PAD = 8;

interface Props {
  tab: TabId;
  setTab: (t: TabId) => void;
  accountOpen: boolean;
  setAccountOpen: (v: boolean) => void;
  sheetId: string | null;
  onClose: () => void;
}

// Coach-mark style walkthrough: dims the screen except for a cutout around
// whatever this step is pointing at, with a small callout explaining it.
// Drives the app's own tab/sidebar state directly (rather than rendering
// fake copies of each screen) so what the customer sees during the tour is
// exactly the real app, not a mockup of it.
export default function TutorialOverlay({ tab, setTab, accountOpen, setAccountOpen, sheetId, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const targetElRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Tracks which step index has already been spoken via a direct click
  // handler (advance(), toggleVoice()) so the mount-only fallback effect
  // further down doesn't also speak it and double up — see
  // PropertyTutorialOverlay.tsx, where this pattern was proven out first.
  const lastSpokenIndexRef = useRef(-1);
  // Frozen once at mount (useState initializer, not useMemo) on purpose:
  // the cookie-consent step only belongs in the tour while consent is still
  // undecided, but consent gets decided DURING that very step — recomputing
  // the list at that moment would shift every later step's index mid-tour.
  const [steps] = useState(() =>
    TUTORIAL_STEPS.filter((s) => s.id !== "cookie-consent" || getCookieConsent() === null)
  );
  const step = steps[stepIndex];

  useEffect(() => {
    setVoiceEnabled(getTutorialVoiceEnabled());
    // Reading the voice list this early doesn't need a user gesture — only
    // actually producing audio does — so priming it on mount means the
    // female-voice pick below usually has real data to work with by the
    // time a tap needs it, instead of racing the browser's own lazy load.
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const finish = (reason: "finished" | "skipped") => {
    setTutorialCompleted(reason);
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    onClose();
  };

  const advance = () => {
    setStepIndex((i) => {
      if (i >= steps.length - 1) {
        setTutorialCompleted("finished");
        if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
        onClose();
        return i;
      }
      const next = i + 1;
      // Speak synchronously, inside whatever click/tap triggered this
      // advance — not deferred into an effect reacting to stepIndex. Mobile
      // browsers (Safari/WebKit especially) only let speechSynthesis.speak()
      // actually produce audio when called inside a real user gesture's own
      // call stack; deferred into a post-render effect, they silently drop
      // it. See PropertyTutorialOverlay.tsx for the full reasoning and the
      // mobile bug this exact pattern fixed there.
      if (voiceEnabled) speakStepAt(next);
      return next;
    });
  };

  // Put the app itself into the state this step needs (right tab, sidebar
  // open/closed) whenever the step changes. Deliberately only reacts to
  // stepIndex - not to tab/accountOpen - so a customer who navigates away
  // from what a step expects isn't fought back into place every render;
  // the spotlight just gracefully fails to find its target instead (see
  // below), and Skip/Next remain the way out either way.
  useEffect(() => {
    if (step.tab && step.tab !== tab) setTab(step.tab);
    if (step.sidebarOpen !== accountOpen) setAccountOpen(step.sidebarOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Find (and re-find, once the tab/sidebar effect above actually lands)
  // this step's spotlight target.
  useEffect(() => {
    let cancelled = false;
    setRect(null);
    targetElRef.current = null;
    if (!step.targetSelector) return;
    waitForElement(step.targetSelector).then((el) => {
      if (cancelled) return;
      targetElRef.current = el;
      if (el) {
        setRect(el.getBoundingClientRect());
        // The target isn't guaranteed to already be on screen - a step
        // whose element sits further down the tab/list than whatever was
        // scrolled into view a moment ago (or on a short mobile viewport)
        // would otherwise get spotlighted using a stale/off-screen rect,
        // which reads as the highlight ring appearing somewhere else
        // entirely (e.g. around the fixed bottom nav) instead of around
        // the real target. See PropertyTutorialOverlay.tsx, where this
        // exact fix shipped first.
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, tab, accountOpen]);

  // Keep the spotlight glued to its target through resize/scroll, and
  // catch late layout shifts (webfonts, images) a beat after it first
  // appears.
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

  // Opening the account sidebar organically (a real tap on the real gear
  // icon) moves past the "here's your account" step on its own - no need
  // to also make the customer tap Next after they've already done the
  // thing this step was asking for.
  useEffect(() => {
    if (step.id === "account-gear" && accountOpen) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountOpen]);

  // Same idea for signing into Google mid-step: a successful sign-in sets
  // sheetId, which is the app's own source of truth for "connected."
  useEffect(() => {
    if (step.id === "google-signin" && sheetId) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  // The cookie-consent step resolves itself: the banner's Accept/Decline
  // buttons write straight to localStorage (no event this component could
  // subscribe to, and no prop that changes), so a light poll is the
  // simplest reliable signal. The banner also unmounts on choice, which
  // would otherwise leave this step spotlighting empty space.
  useEffect(() => {
    if (step.id !== "cookie-consent") return;
    const timer = window.setInterval(() => {
      if (getCookieConsent() !== null) advance();
    }, 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Escape backs all the way out of the tour, same as "Skip tour" - matches
  // ClearCacheButton's existing Escape-to-cancel pattern for this app's
  // other full-screen overlay.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish("skipped");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send focus into the callout card each time a new step appears, so
  // keyboard/screen-reader users land somewhere inside the dialog instead
  // of wherever focus happened to be on the underlying page (which, for a
  // spotlighted step, might not even be visible under the dim mask).
  useEffect(() => {
    cardRef.current?.focus();
  }, [stepIndex]);

  // Picks the closest thing to a "soft female voice" the Web Speech API
  // actually exposes — same best-effort name-match heuristic as
  // PropertyTutorialOverlay.tsx (no reliable gender field exists on
  // SpeechSynthesisVoice), falling back to the first available English
  // voice, then to no override at all. Never a hard requirement: a device
  // with no speech support just runs this tour silently, same as before.
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

  const speakStepAt = (index: number) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const target = steps[index];
    if (!target) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(`${target.title}. ${target.body}`);
    const voice = pickVoice(window.speechSynthesis.getVoices());
    if (voice) utter.voice = voice;
    utter.pitch = 1.05;
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
    lastSpokenIndexRef.current = index;
  };

  // Fallback for the one path that can never be gesture-driven: the very
  // first step, shown as soon as the tour opens rather than from a tap.
  // Every other step transition is already spoken synchronously inside its
  // own click handler (advance(), toggleVoice() below) — this effect only
  // speaks when that hasn't already happened for the current step, so
  // nothing plays twice.
  useEffect(() => {
    if (!voiceEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
    if (lastSpokenIndexRef.current === stepIndex) return;
    if (window.speechSynthesis.getVoices().length === 0) {
      const onVoicesChanged = () => {
        if (lastSpokenIndexRef.current !== stepIndex) speakStepAt(stepIndex);
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged, { once: true });
      return () => window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
    }
    speakStepAt(stepIndex);
    return () => {
      window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, voiceEnabled]);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setTutorialVoiceEnabled(next);
    if (next) {
      // Same gesture-synchronicity reasoning as advance() above — speak the
      // step already on screen right inside this tap.
      speakStepAt(stepIndex);
    } else if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  // A minimal focus trap: Tab/Shift+Tab cycles only among this card's own
  // focusable elements (its two buttons) rather than escaping into whatever
  // sits behind the dimmed mask - standard expected behavior for anything
  // marked aria-modal.
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
    // pointer-events-none here is load-bearing, not decorative: this outer
    // div's own box spans the full viewport at z-[200], so without this it
    // would swallow every click - including ones aimed at the "hole" over
    // the spotlighted element - regardless of the mask bands below only
    // painting around that hole. Each interactive piece (the masks, the
    // callout card) opts back into pointer-events-auto individually; the
    // real element under the hole is never covered by anything here, so it
    // falls through to receive the click normally.
    <div className="pointer-events-none fixed inset-0 z-[200]">
      {rect ? (
        <>
          {/* Four masking bands leave a real, clickable hole over the
              target rect instead of dimming the whole viewport with one
              div - the highlighted element underneath (a real button, e.g.
              "Sign in with Google" or "Start Fresh") stays genuinely
              interactive rather than just visible. */}
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
