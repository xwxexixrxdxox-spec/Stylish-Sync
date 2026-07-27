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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Tracks which step index has already been played via a direct click
  // handler (advance(), toggleVoice()) so the mount-only fallback effect
  // further down doesn't also play it and double up — see
  // PropertyTutorialOverlay.tsx, where this pattern was proven out first.
  const lastSpokenIndexRef = useRef(-1);
  // Mirrors stepIndex for the async callbacks below (audio timeupdate, a
  // setTimeout fallback) that fire well after their own effect ran — React
  // state captured in a closure at that moment would be stale by the time
  // they actually run, so they check this ref instead to confirm the step
  // they were scheduled for is still the one showing before acting on it.
  const stepIndexRef = useRef(0);
  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);
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
  }, []);

  const finish = (reason: "finished" | "skipped") => {
    setTutorialCompleted(reason);
    audioRef.current?.pause();
    onClose();
  };

  const advance = () => {
    setStepIndex((i) => {
      if (i >= steps.length - 1) {
        setTutorialCompleted("finished");
        audioRef.current?.pause();
        onClose();
        return i;
      }
      const next = i + 1;
      // Play synchronously, inside whatever click/tap triggered this
      // advance — not deferred into an effect reacting to stepIndex. Mobile
      // browsers (Safari/WebKit especially) only let HTMLMediaElement.play()
      // actually produce audio when called inside a real user gesture's own
      // call stack; deferred into a post-render effect, they silently
      // reject the play() promise instead. Same constraint this file used
      // to work around for speechSynthesis.speak() — see
      // PropertyTutorialOverlay.tsx for the fuller history.
      if (voiceEnabled) playStepAt(next);
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

  // Points the spotlight at a real element: records it, positions the
  // rect, scrolls it into view, and (re)attaches a ResizeObserver so
  // content that grows/shrinks after the spotlight first lands - the
  // "scan" step's wrapper going from a plain button to a whole camera
  // view once scanning starts is the concrete case that needed this, but
  // it's a general fix - keeps the hole glued to the target's actual
  // current size instead of the size it happened to be when first found.
  // Shared by the normal per-step target search below and by
  // switchTarget() (the "reorder" step's mid-narration retarget).
  const attachTarget = (el: HTMLElement) => {
    resizeObserverRef.current?.disconnect();
    targetElRef.current = el;
    setRect(el.getBoundingClientRect());
    // The target isn't guaranteed to already be on screen - a step whose
    // element sits further down the tab/list than whatever was scrolled
    // into view a moment ago (or on a short mobile viewport) would
    // otherwise get spotlighted using a stale/off-screen rect, which reads
    // as the highlight ring appearing somewhere else entirely (e.g. around
    // the fixed bottom nav) instead of around the real target. See
    // PropertyTutorialOverlay.tsx, where this exact fix shipped first.
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const observer = new ResizeObserver(() => {
      if (targetElRef.current) setRect(targetElRef.current.getBoundingClientRect());
    });
    observer.observe(el);
    resizeObserverRef.current = observer;
  };

  // Find (and re-find, once the tab/sidebar effect above actually lands)
  // this step's spotlight target.
  useEffect(() => {
    let cancelled = false;
    setRect(null);
    targetElRef.current = null;
    resizeObserverRef.current?.disconnect();
    if (!step.targetSelector) return;
    waitForElement(step.targetSelector).then((el) => {
      if (cancelled) return;
      if (el) attachTarget(el);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, tab, accountOpen]);

  // Belt-and-suspenders cleanup on unmount - attachTarget always disconnects
  // the previous observer before creating a new one, but nothing does that
  // for the very last one when the tour itself closes.
  useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

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

  // stock-controls-tap/-hold resolve themselves off the real press state
  // ItemCard mirrors onto its data-tutorial-burst-count/-phase attributes
  // (see ItemCard.tsx) for whichever item this tour is pointing at. A tap
  // step is satisfied by any real press at all (count reaches 1 the
  // instant a press starts, tap or hold alike); a hold step needs the
  // press to have actually reached the repeat-interval "holding" phase (or
  // a count of 2+, which only real hold-repeat ticks produce) - a plain
  // tap during the hold step leaves count at 1 and correctly doesn't
  // resolve it. Watches the target via MutationObserver rather than
  // polling, since the attributes only change when a real press does.
  useEffect(() => {
    if (step.id !== "stock-controls-tap" && step.id !== "stock-controls-hold") return;
    if (!rect || !targetElRef.current) return;
    const el = targetElRef.current;
    const satisfied = () => {
      const count = Number(el.getAttribute("data-tutorial-burst-count") || "0");
      const phase = el.getAttribute("data-tutorial-burst-phase") || "";
      if (step.id === "stock-controls-tap") return count >= 1;
      return phase === "holding" || count >= 2;
    };
    if (satisfied()) {
      advance();
      return;
    }
    const observer = new MutationObserver(() => {
      if (satisfied()) advance();
    });
    observer.observe(el, { attributes: true, attributeFilter: ["data-tutorial-burst-count", "data-tutorial-burst-phase"] });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, rect]);

  // "scan" resolves itself once a real scan produces a lookup response —
  // ScanTab mirrors its own lookupStatus state onto
  // data-tutorial-lookup-status on the scan panel (see ScanTab.tsx).
  // "idle"/"checking" are the two in-flight states; anything else (found,
  // existing, multiple, not-found, ...) means a real answer came back, so
  // any of those advances. Watches the scan panel itself rather than
  // targetElRef.current, since the status attribute lives on an ancestor
  // of the spotlighted button, not the button itself. Next still works too
  // - a customer with nothing on hand to scan right now isn't stuck.
  useEffect(() => {
    if (step.id !== "scan") return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    waitForElement('[data-tutorial="scan-panel"]').then((el) => {
      if (cancelled || !el) return;
      const satisfied = () => {
        const status = el.getAttribute("data-tutorial-lookup-status") || "idle";
        return status !== "idle" && status !== "checking";
      };
      if (satisfied()) {
        advance();
        return;
      }
      observer = new MutationObserver(() => {
        if (satisfied()) advance();
      });
      observer.observe(el, { attributes: true, attributeFilter: ["data-tutorial-lookup-status"] });
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

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

  // Moves the spotlight to a new target mid-step, for the "reorder" step's
  // targetSelectorPhase2 (see tutorial.ts). Only called once per step (the
  // callers that use this each remove their own trigger the moment they
  // fire), so there's no need to guard against re-entrancy here.
  const switchTarget = (selector: string) => {
    waitForElement(selector).then((el) => {
      if (el) attachTarget(el);
    });
  };

  // Recorded narration lives in public/audio/tutorial/<step id>.mp3 — one
  // clip per step, generated from a local ComfyUI/Chatterbox TTS pipeline
  // (see the comment above TUTORIAL_STEPS in tutorial.ts for how). Named by
  // id rather than stored as a field on each step, so adding a new step
  // just means dropping in a matching file; nothing here needs updating.
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
    const audio = new Audio(`/audio/tutorial/${target.id}.mp3`);
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

    // Mid-step target switch (currently only "reorder"): once this clip
    // crosses its own halfway point, move the spotlight to the step's
    // second target. Keyed off the *playing clip's* progress rather than a
    // flat delay so it stays in sync with whatever the narration is saying
    // at that moment, even if a future re-recording changes the clip's
    // length. audio.currentTime resets to 0 and starts climbing from the
    // very first timeupdate tick, so this can't fire before playback
    // genuinely begins.
    if (target.targetSelectorPhase2) {
      const onTimeUpdate = () => {
        if (!audio.duration || audio.currentTime < audio.duration / 2) return;
        audio.removeEventListener("timeupdate", onTimeUpdate);
        window.clearTimeout(fallbackTimer);
        if (stepIndexRef.current === index) switchTarget(target.targetSelectorPhase2!);
      };
      audio.addEventListener("timeupdate", onTimeUpdate);
      // Fallback for when there's no clip actually playing to key off (the
      // customer has voice muted, or this device declined to play it) —
      // same switch, on a plain timer instead of real playback progress.
      // Cleared above the moment real playback progress does the job
      // instead, so a normal play-through never double-switches.
      const fallbackTimer = window.setTimeout(() => {
        audio.removeEventListener("timeupdate", onTimeUpdate);
        if (stepIndexRef.current === index) switchTarget(target.targetSelectorPhase2!);
      }, target.phase2FallbackMs ?? 4000);
    }

    return audio;
  };

  // Fallback for the one path that can never be gesture-driven: the very
  // first step, shown as soon as the tour opens rather than from a tap.
  // Every other step transition is already played synchronously inside its
  // own click handler (advance(), toggleVoice() below) — this effect only
  // plays when that hasn't already happened for the current step, so
  // nothing plays twice. Unlike the old speechSynthesis version there's no
  // async voice list to wait on here, so this just plays immediately.
  useEffect(() => {
    if (!voiceEnabled || typeof window === "undefined") return;
    if (lastSpokenIndexRef.current === stepIndex) return;
    const audio = playStepAt(stepIndex);
    // Pause the exact clip this effect started, not "whatever audioRef
    // currently points at" — by the time this cleanup fires (React runs it
    // right before the *next* effect invocation, i.e. right after the next
    // step's gesture-driven playStepAt() has already reassigned audioRef),
    // the ref may already belong to a newer clip. Pausing that instead was
    // cutting every step's narration off almost immediately after it
    // started (an AbortError from play() racing pause()) — caught via a
    // live console check on weirdsync.com after this shipped, not in dev.
    return () => {
      audio?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, voiceEnabled]);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setTutorialVoiceEnabled(next);
    if (next) {
      // Same gesture-synchronicity reasoning as advance() above — play the
      // step already on screen right inside this tap.
      playStepAt(stepIndex);
    } else {
      audioRef.current?.pause();
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
  const audioSupported = typeof window !== "undefined" && typeof Audio !== "undefined";

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
