"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Volume2, VolumeX, X } from "lucide-react";
import { TUTORIAL_STEPS, waitForElement } from "@/lib/tutorial";
import {
  getCookieConsent,
  setTutorialCompleted,
  getTutorialVoiceEnabled,
  setTutorialVoiceEnabled,
} from "@/lib/storage";
import { computeMaskBands, inflateRect, type Rect } from "@/lib/tutorialMask";
import type { TabId } from "./BottomNav";

// Gap between the spotlighted element and both the glow ring and the
// masking bands around it, in px. Kept small on purpose (third generation
// of this component - see the top-level comment below) so the glow hugs
// the real element's own edges rather than reading as a padded box drawn
// around it.
const PAD = 4;

interface Props {
  tab: TabId;
  setTab: (t: TabId) => void;
  accountOpen: boolean;
  setAccountOpen: (v: boolean) => void;
  sheetId: string | null;
  onClose: () => void;
}

// Coach-mark style walkthrough: blurs the screen except for a cutout
// around whatever this step is pointing at. Third generation of this
// component - the original explained each step through a full callout
// card; the second (K/L) replaced that with a small caption bubble plus a
// pulsating glow; this one drops visible text entirely. The voice
// narration (playStepAt below) is now the *only* explanation a step
// gives - there's no dialog box, no card, nothing to read - so the glow
// itself has to carry more of the "look here" job: it's rendered flush
// against the real target element's own shape (its actual computed
// border-radius, see targetRadius below) rather than a generic rounded
// box floating a few pixels out from it, and a clip auto-advances the
// tour the instant it finishes playing instead of waiting on a "Next" tap
// inside a card that no longer exists. A small corner HUD (step counter,
// mute, manual next, skip) is the only chrome left, and a visually-hidden
// live region keeps the step's own title/body available to screen
// readers even though nothing on screen shows that text anymore. Drives
// the app's own tab/sidebar state directly (rather than rendering fake
// copies of each screen) so what the customer sees during the tour is
// exactly the real app, not a mockup of it. The tour itself is opened
// on demand now (a button near the header's theme toggle - see page.tsx)
// rather than autoplaying on first visit.
export default function TutorialOverlay({ tab, setTab, accountOpen, setAccountOpen, sheetId, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  // The spotlighted element's own computed border-radius, applied to the
  // glow rings below instead of a hardcoded corner style - a circular icon
  // button gets a circular glow, a pill-shaped toggle gets a pill-shaped
  // glow, matching whatever the real element actually looks like rather
  // than an approximation of it.
  const [targetRadius, setTargetRadius] = useState<string>("0.75rem");
  const targetElRef = useRef<HTMLElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // The step's own focusSelectors (see tutorial.ts) - elements that stay
  // sharp/unblurred for the whole step alongside whatever the glow is
  // currently pointing at. Tracked the same way as the main target: a ref
  // to the real elements (for measuring + observing resize) and a bit of
  // state holding their current rects (for rendering).
  const focusElsRef = useRef<HTMLElement[]>([]);
  const focusResizeObserversRef = useRef<ResizeObserver[]>([]);
  const [focusRects, setFocusRects] = useState<Rect[]>([]);
  const recomputeFocusRects = () => {
    setFocusRects(focusElsRef.current.map((el) => el.getBoundingClientRect()));
  };
  // Wraps every focusable control the corner HUD renders (mute, manual
  // next, skip) - queried by onOverlayKeyDown below for the Tab focus trap.
  const overlayRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Tracks which step index has already been played via a direct click
  // handler (advance(), toggleVoice()) so the mount-only fallback effect
  // further down doesn't also play it and double up — see
  // PropertyTutorialOverlay.tsx, where this pattern was proven out first.
  const lastSpokenIndexRef = useRef(-1);
  // Guards against advancing twice for the same step - e.g. a real user
  // gesture satisfying a self-resolving step (a tap, a real sign-in) and
  // that step's narration clip finishing right around the same moment
  // would otherwise both call advance() and skip a step. Reset the
  // instant stepIndex actually changes.
  const hasAdvancedRef = useRef(false);
  useEffect(() => {
    hasAdvancedRef.current = false;
  }, [stepIndex]);
  // Mirrors stepIndex for the async callbacks below (audio timeupdate/ended,
  // a setTimeout fallback) that fire well after their own effect ran — React
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
    if (hasAdvancedRef.current) return;
    hasAdvancedRef.current = true;
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
  // below), and the HUD's Skip/Next remain the way out either way.
  useEffect(() => {
    if (step.tab && step.tab !== tab) setTab(step.tab);
    if (step.sidebarOpen !== accountOpen) setAccountOpen(step.sidebarOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Points the spotlight at a real element: records it, positions the
  // rect, reads its real border-radius, scrolls it into view, and
  // (re)attaches a ResizeObserver so content that grows/shrinks after the
  // spotlight first lands - the "scan" step's wrapper going from a plain
  // button to a whole camera view once scanning starts is the concrete
  // case that needed this, but it's a general fix - keeps the hole glued
  // to the target's actual current size instead of the size it happened
  // to be when first found. Shared by the normal per-step target search
  // below and by switchTarget() (the "reorder" step's mid-narration
  // retarget).
  const attachTarget = (el: HTMLElement) => {
    resizeObserverRef.current?.disconnect();
    targetElRef.current = el;
    setRect(el.getBoundingClientRect());
    setTargetRadius(window.getComputedStyle(el).borderRadius || "0.75rem");
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

  // Same idea as the main target above, for this step's focusSelectors (if
  // any) - resolved independently of the glow target so a step can keep
  // several unrelated elements sharp at once (e.g. "reorder"'s item card
  // AND its search-by toggle, alongside whichever one the glow itself is
  // currently visiting).
  useEffect(() => {
    let cancelled = false;
    focusResizeObserversRef.current.forEach((o) => o.disconnect());
    focusResizeObserversRef.current = [];
    focusElsRef.current = [];
    setFocusRects([]);
    const selectors = step.focusSelectors ?? [];
    if (!selectors.length) return;
    Promise.all(selectors.map((sel) => waitForElement(sel))).then((els) => {
      if (cancelled) return;
      const found = els.filter((e): e is HTMLElement => !!e);
      focusElsRef.current = found;
      recomputeFocusRects();
      focusResizeObserversRef.current = found.map((el) => {
        const observer = new ResizeObserver(recomputeFocusRects);
        observer.observe(el);
        return observer;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, tab, accountOpen]);

  // Belt-and-suspenders cleanup on unmount - attachTarget always disconnects
  // the previous observer before creating a new one, but nothing does that
  // for the very last one when the tour itself closes.
  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      focusResizeObserversRef.current.forEach((o) => o.disconnect());
    };
  }, []);

  // Keep the spotlight glued to its target through resize/scroll, and
  // catch late layout shifts (webfonts, images) a beat after it first
  // appears.
  useEffect(() => {
    const recompute = () => {
      if (targetElRef.current) setRect(targetElRef.current.getBoundingClientRect());
      if (focusElsRef.current.length) recomputeFocusRects();
    };
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    const settleTimer = window.setTimeout(recompute, 250);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
      window.clearTimeout(settleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // of the spotlighted button, not the button itself. The manual Next in
  // the corner HUD still works too - a customer with nothing on hand to
  // scan right now isn't stuck.
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

  // Covers a gap in playStepAt's own phase2FallbackMs: that timer only ever
  // gets scheduled as a side effect of playStepAt() actually running, but
  // playStepAt() is never called at all while voiceEnabled is false (see
  // advance() and the mount-only effect below, both gated on it) - so a
  // customer who has the tour muted for a step's entire duration would
  // never see the glow move to targetSelectorPhase2, no matter how long
  // they waited. This schedules the exact same switch independently
  // whenever voice is already off the moment this step starts, so a fully
  // muted customer still gets it. (Toggling voice on mid-step re-runs this
  // effect, sees voiceEnabled is now true, and cleans up without
  // scheduling - playStepAt's own audio-driven switch takes over from
  // there.)
  useEffect(() => {
    if (voiceEnabled || !step.targetSelectorPhase2) return;
    const timer = window.setTimeout(() => {
      switchTarget(step.targetSelectorPhase2!);
    }, step.phase2FallbackMs ?? 4000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, voiceEnabled]);

  // Send focus into the tour's own overlay each time a new step appears, so
  // keyboard/screen-reader users land somewhere inside the tour instead of
  // wherever focus happened to be on the underlying page. There's no
  // callout card to focus into anymore - the overlay itself (tabIndex -1
  // below) is the landing spot, with the corner HUD's buttons reachable
  // from there via Tab and the step's own title/body announced through the
  // aria-live region rendered alongside it.
  useEffect(() => {
    overlayRef.current?.focus();
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
    // sits on that step, spotlight and all, until the customer taps the
    // corner HUD's manual Next rather than throwing or getting stuck
    // silently forever. AbortError is excluded from the warning entirely:
    // it fires whenever this clip gets superseded by a pause() call before
    // it finished — the ordinary, expected outcome of the customer
    // advancing before narration wraps up, not a real failure worth
    // surfacing.
    audio.play().catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.warn(`Tutorial narration failed for step "${target.id}":`, err);
    });
    lastSpokenIndexRef.current = index;

    // With the caption's own "Next" button gone, the clip finishing is now
    // the tour's primary way of moving itself along - the voice alone
    // guides the customer through the app, including when to move to the
    // next thing. A self-resolving step (stock-controls-tap, scan, ...)
    // may well already have advanced by the time this fires; advance()'s
    // own hasAdvancedRef guard makes that a harmless no-op rather than a
    // double-skip.
    audio.addEventListener("ended", () => {
      if (stepIndexRef.current === index) advance();
    });

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

  // A minimal focus trap: Tab/Shift+Tab cycles only among the corner HUD's
  // own buttons (mute, manual next, skip) - instead of escaping into
  // whatever sits behind the blurred mask, standard expected behavior for
  // anything marked aria-modal.
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
  const audioSupported = typeof window !== "undefined" && typeof Audio !== "undefined";

  // Every element that should stay sharp and interactive right now: the
  // glow's own current target, plus this step's focusSelectors (e.g.
  // "reorder"'s item card and search-by toggle, which stay in focus for the
  // whole step regardless of which one the glow itself is visiting).
  // computeMaskBands turns that into however many rectangles still need to
  // be blurred - one band when there's a single hole (the common case,
  // visually equivalent to the old four-band cutout), more when a step
  // keeps several separate elements in focus at once.
  const glowRect = rect ? inflateRect(rect, PAD) : null;
  const focusHoles = focusRects.map((r) => inflateRect(r, PAD));
  const maskHoles = glowRect ? [glowRect, ...focusHoles] : focusHoles;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
  const maskBands = computeMaskBands(maskHoles, viewportWidth, viewportHeight);

  return createPortal(
    // pointer-events-none here is load-bearing, not decorative: this outer
    // div's own box spans the full viewport at z-[200], so without this it
    // would swallow every click - including ones aimed at any of the "holes"
    // over the focused elements - regardless of the mask bands below only
    // painting around them. Each interactive piece (the masks, the corner
    // HUD) opts back into pointer-events-auto individually; the real
    // elements under the holes are never covered by anything here, so they
    // fall through to receive clicks normally. tabIndex=-1 + outline-none
    // makes this div itself the tour's focus landing spot (see the effect
    // above) without a distracting full-viewport focus ring.
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="pointer-events-none fixed inset-0 z-[200] outline-none"
      onKeyDown={onOverlayKeyDown}
    >
      {/* No visible dialog box anymore - the step's title/body still exist
          (see tutorial.ts) for accessibility and for the narration-script
          handoff doc, but on screen the voice alone carries them. This
          live region keeps that text available to screen readers even
          though nothing shows it visually. */}
      <div className="sr-only" aria-live="polite">
        {step.title}. {step.body}
      </div>
      {/* Blurred + dimmed bands cover everything that isn't currently in
          focus, real, clickable holes left over each focused element rather
          than a single dim overlay - see computeMaskBands. Blurring (rather
          than a flat dim) is what makes the in-focus elements read as
          in-focus: everything else visibly falls out of focus around them,
          the same depth-of-field cue a game uses to say "look here." Kept
          light (a quarter of the original blur strength) so the rest of
          the app stays legible in the background instead of turning into a
          frosted wall. */}
      {maskBands.map((band, i) => (
        <div
          key={i}
          className="pointer-events-auto fixed bg-black/45 backdrop-blur-[3px] transition-all duration-200"
          style={{ top: band.top, left: band.left, width: band.width, height: band.height }}
        />
      ))}
      {glowRect && (
        <>
          {/* The "quest marker" glow: an expanding, fading ping ring behind
              a breathing blurred-glow ring, hugging the real spotlighted
              element's own shape (targetRadius) rather than a generic
              rounded box drawn a few pixels out from it - a circular icon
              button glows circular, a pill toggle glows pill-shaped. Amber
              rather than the app's existing accent colors (red is reserved
              for low-stock warnings, green for "all clear") - a color that
              reads as "here, this one" without also reading as a status. */}
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

      {/* Minimal corner HUD: voice mute toggle, step counter, a manual
          "next" for anyone who wants to move on before (or without) the
          narration finishing, and skip/exit - the only chrome the tour has
          left now that there's no dialog card. Fixed in the corner rather
          than following the spotlight, so it reads as a persistent status
          readout - like a game's HUD - instead of competing with the glow
          for attention. */}
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
