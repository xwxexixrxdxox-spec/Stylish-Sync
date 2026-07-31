"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Volume2, VolumeX, X } from "lucide-react";
import { TUTORIAL_STEPS, waitForElement } from "@/lib/tutorial";
import {
  getCookieConsent,
  setTutorialCompleted,
  getTutorialVoiceEnabled,
  setTutorialVoiceEnabled,
} from "@/lib/storage";
import { computeMaskBands, inflateRect, type Rect } from "@/lib/tutorialMask";
import TutorialSoundBar from "./TutorialSoundBar";
import type { TabId } from "./BottomNav";

// Gap between the spotlighted element and both the glow ring and the
// masking bands around it, in px. Kept small on purpose (third generation
// of this component - see the top-level comment below) so the glow hugs
// the real element's own edges rather than reading as a padded box drawn
// around it.
const PAD = 4;
// How far a pointer has to move before a press on the HUD counts as a drag
// rather than a click - lets the mute/next/skip buttons inside the same
// pill still register ordinary taps instead of every tap being swallowed
// as a zero-distance "drag."
const DRAG_THRESHOLD_PX = 4;

interface Props {
  tab: TabId;
  setTab: (t: TabId) => void;
  accountOpen: boolean;
  setAccountOpen: (v: boolean) => void;
  sheetId: string | null;
  onClose: () => void;
  // Reports the id of whichever step is currently showing (or null once
  // the tour closes) - page.tsx uses this to make a couple of real
  // features tutorial-aware without this component needing to know
  // anything about them itself: the header's clear-cache button goes into
  // a dud/no-op mode for the tutorial's own duration (see ClearCacheButton
  // tutorialDud), and the Usage tab narrows its overview list to one item
  // only while this tour's own "usage" step is showing.
  onStepChange?: (id: string | null) => void;
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
// box floating a few pixels out from it. A small corner HUD (step
// counter, mute, back, next/move-on, skip) is the only chrome left, drives
// the app's own tab/sidebar state directly (rather than rendering fake
// copies of each screen) so what the customer sees during the tour is
// exactly the real app, not a mockup of it.
//
// Fourth-generation change (this round, "O"): nothing advances on its own
// anymore except a small, deliberate allow-list of real actions that ARE
// literally the thing a step just asked for (opening the account panel,
// signing into Google, resolving the cookie banner, a real scan result, or
// drilling into an item on the Usage tab) - a narration clip finishing no
// longer auto-advances the tour by itself, and the stock-stepper steps no
// longer jump forward the instant a single tap/hold is detected. Both were
// the concrete "moves forward too quickly, before I'm done trying it"
// complaints that drove this round. The stock-stepper pair instead show a
// bigger, explicitly-labeled "Move on" button (step.moveOnLabel) in place
// of the small chevron, so a customer can tap ±/hold as many times as they
// want before choosing to continue. A HUD back arrow and drag-to-reposition
// (this HUD can now sit somewhere less in-the-way) are both new too.
export default function TutorialOverlay({ tab, setTab, accountOpen, setAccountOpen, sheetId, onClose, onStepChange }: Props) {
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
  // Wraps every focusable control the corner HUD renders (mute, back,
  // next/move-on, skip) - queried by onOverlayKeyDown below for the Tab
  // focus trap.
  const overlayRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Tracks which step index has already been played via a direct click
  // handler (advance(), goBack(), toggleVoice()) so the mount-only fallback
  // effect further down doesn't also play it and double up — see
  // PropertyTutorialOverlay.tsx, where this pattern was proven out first.
  const lastSpokenIndexRef = useRef(-1);
  // Guards against advancing twice for the same step - e.g. a real user
  // gesture satisfying a self-resolving step (a tap, a real sign-in) and a
  // near-simultaneous manual tap both calling advance(). Reset the instant
  // stepIndex actually changes (by either advance() or goBack()).
  const hasAdvancedRef = useRef(false);
  useEffect(() => {
    hasAdvancedRef.current = false;
  }, [stepIndex]);
  // Mirrors stepIndex for the async callbacks below (audio timeupdate, a
  // setTimeout fallback) that fire well after their own effect ran — React
  // state captured in a closure at that moment would be stale by the time
  // they actually run, so they check this ref instead to confirm the step
  // they were scheduled for is still the one showing before acting on it.
  const stepIndexRef = useRef(0);
  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);
  // Whether narration is actively playing right now - drives
  // TutorialSoundBar for the handful of steps that show one (see
  // step.showSoundBar). Tracked via the real <audio> element's own
  // play/pause/ended events rather than inferred from stepIndex, so it
  // stays correct through mute/unmute and a clip actually finishing.
  const [speaking, setSpeaking] = useState(false);
  // Whether this step's blur mask is temporarily suppressed - see
  // step.suppressBlurMs (used by "reorder": "remove the blur for 5
  // seconds, then reapply it" so the customer can see the real reorder
  // list without anything dimmed around it for a beat).
  const [blurSuppressed, setBlurSuppressed] = useState(false);
  // Manual repositioning for the corner HUD - null means "use the default
  // top-right corner," set once the customer actually drags it somewhere
  // else. Kept as component state only (not persisted) - a fresh position
  // each time the tour opens is the least surprising default.
  const [hudPos, setHudPos] = useState<{ left: number; top: number } | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    dragging: boolean;
  } | null>(null);
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

  useEffect(() => {
    onStepChange?.(step?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  useEffect(() => {
    return () => onStepChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // suppressBlurMs: hide the mask entirely for this many ms at the start of
  // a step, then let it back in. Reset (re-armed) every time the step
  // changes, and only ever active for a step that actually asks for it.
  useEffect(() => {
    if (!step.suppressBlurMs) {
      setBlurSuppressed(false);
      return;
    }
    setBlurSuppressed(true);
    const timer = window.setTimeout(() => setBlurSuppressed(false), step.suppressBlurMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

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
      // reject the play() promise instead.
      if (voiceEnabled) playStepAt(next);
      return next;
    });
  };

  // Steps back one - same gesture-synchronicity treatment as advance()
  // above, and the same hasAdvancedRef guard (a customer mashing both
  // arrows shouldn't be able to end up two steps back from one tap). Does
  // nothing on the first step; there's nothing before "welcome" to return
  // to, and Skip already covers "I want out entirely."
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
  // spotlight first lands keeps the hole glued to the target's actual
  // current size. Shared by the normal per-step target search below and by
  // switchTarget() (a step's mid-narration retarget).
  const attachTarget = (el: HTMLElement) => {
    resizeObserverRef.current?.disconnect();
    targetElRef.current = el;
    setRect(el.getBoundingClientRect());
    setTargetRadius(window.getComputedStyle(el).borderRadius || "0.75rem");
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
  // several unrelated elements sharp at once.
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

  // A small, deliberate allow-list of steps that still self-resolve off a
  // real action - each one is the literal thing the step is asking the
  // customer to do, not a passive timer or "narration finished" trigger
  // (see the top-level comment for why that distinction matters this
  // round). Opening the account sidebar organically moves past "here's
  // your account" on its own - no need to also make the customer tap Next
  // after they've already done the thing this step was asking for.
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

  // "scan" resolves itself once a real scan produces a lookup response —
  // ScanTab mirrors its own lookupStatus state onto
  // data-tutorial-lookup-status on the scan panel (see ScanTab.tsx).
  // "idle"/"checking" are the two in-flight states; anything else means a
  // real answer came back, so any of those advances. The manual Next in
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

  // "usage" resolves itself once the customer actually drills into an
  // item's detail view - the tour's own explicit exception to "nothing
  // moves forward by itself" this round, since exploring the one narrowed
  // item IS the thing this step is asking for (see tutorial.ts's usage
  // step and UsageTab.tsx, whose time-frame picker only renders once the
  // detail view is showing - its appearance is what this watches for,
  // since UsageOverview's onSelectItem callback lives a component away
  // from this overlay).
  useEffect(() => {
    if (step.id !== "usage") return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    const check = () => {
      if (document.querySelector('[data-tutorial="usage-timeframe-buttons"]')) advance();
    };
    check();
    observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
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
  // playStepAt() is never called at all while voiceEnabled is false - so a
  // customer who has the tour muted for a step's entire duration would
  // never see the glow move to targetSelectorPhase2, no matter how long
  // they waited. This schedules the exact same switch independently
  // whenever voice is already off the moment this step starts, so a fully
  // muted customer still gets it.
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
  // wherever focus happened to be on the underlying page.
  useEffect(() => {
    overlayRef.current?.focus();
  }, [stepIndex]);

  // Moves the spotlight to a new target mid-step, for a step's
  // targetSelectorPhase2 (see tutorial.ts). Only called once per step (the
  // callers that use this each remove their own trigger the moment they
  // fire), so there's no need to guard against re-entrancy here.
  const switchTarget = (selector: string) => {
    waitForElement(selector).then((el) => {
      if (el) attachTarget(el);
    });
  };

  // Recorded narration lives in public/audio/tutorial/<step id>.mp3 — one
  // clip per step, generated from a local ComfyUI/Chatterbox TTS pipeline.
  // Named by id rather than stored as a field on each step, so adding a
  // new step just means dropping in a matching file; nothing here needs
  // updating. Returns the Audio element it created (or null if it didn't
  // play one) so callers that need to clean up after *this specific* clip
  // can do so without going back through the shared audioRef, which may
  // have already moved on to a later step's clip by the time that cleanup
  // runs.
  const playStepAt = (index: number): HTMLAudioElement | null => {
    if (typeof window === "undefined" || typeof Audio === "undefined") return null;
    const target = steps[index];
    if (!target) return null;
    audioRef.current?.pause();
    const audio = new Audio(`/audio/tutorial/${target.id}.mp3`);
    audioRef.current = audio;
    setSpeaking(false);
    // A missing file and a browser declining to autoplay both reject this
    // promise — neither is treated as fatal: the tour just sits on that
    // step, spotlight and all, until the customer taps the corner HUD's
    // manual Next/Move on, rather than throwing or getting stuck silently
    // forever. AbortError is excluded from the warning entirely: it fires
    // whenever this clip gets superseded by a pause() call before it
    // finished — the ordinary, expected outcome of the customer advancing
    // before narration wraps up, not a real failure worth surfacing.
    audio.play().catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.warn(`Tutorial narration failed for step "${target.id}":`, err);
    });
    lastSpokenIndexRef.current = index;

    // Drives TutorialSoundBar for the steps that show one - real playback
    // state, not just "is this the active step," so muting or a clip
    // ending correctly settles the bars.
    const onPlay = () => {
      if (stepIndexRef.current === index) setSpeaking(true);
    };
    const onPauseOrEnd = () => {
      if (stepIndexRef.current === index) setSpeaking(false);
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPauseOrEnd);
    audio.addEventListener("ended", onPauseOrEnd);

    // Mid-step target switch (e.g. "reorder-search-and-find"): once this
    // clip crosses its own halfway point, move the spotlight to the step's
    // second target. Keyed off the *playing clip's* progress rather than a
    // flat delay so it stays in sync with whatever the narration is saying
    // at that moment, even if a future re-recording changes the clip's
    // length.
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
    setTutorialVoiceEnabled(next);
    if (next) {
      playStepAt(stepIndex);
    } else {
      audioRef.current?.pause();
      setSpeaking(false);
    }
  };

  // A minimal focus trap: Tab/Shift+Tab cycles only among the corner HUD's
  // own buttons - instead of escaping into whatever sits behind the
  // blurred mask, standard expected behavior for anything marked
  // aria-modal.
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

  // Drag-to-reposition for the corner HUD. Starts tracking on pointerdown
  // anywhere in the pill EXCEPT on one of its own buttons (so mute/back/
  // next/skip still register as plain taps), and only actually starts
  // moving the pill once the pointer has traveled past DRAG_THRESHOLD_PX -
  // a real drag gesture, not every press-and-release.
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

  const nextLabel = step.moveOnLabel ?? step.nextLabel ?? "Next";
  const audioSupported = typeof window !== "undefined" && typeof Audio !== "undefined";
  const isFirstStep = stepIndex === 0;

  // Every element that should stay sharp and interactive right now: the
  // glow's own current target, plus this step's focusSelectors. Suppressed
  // entirely (no bands rendered at all - nothing blurred, nothing dimmed)
  // while blurSuppressed is true, for a step that explicitly asked for a
  // few seconds of a completely clear view (see suppressBlurMs above).
  const glowRect = rect ? inflateRect(rect, PAD) : null;
  const focusHoles = focusRects.map((r) => inflateRect(r, PAD));
  const maskHoles = glowRect ? [glowRect, ...focusHoles] : focusHoles;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
  const maskBands = blurSuppressed ? [] : computeMaskBands(maskHoles, viewportWidth, viewportHeight);

  return createPortal(
    // pointer-events-none here is load-bearing, not decorative: this outer
    // div's own box spans the full viewport at z-[200], so without this it
    // would swallow every click - including ones aimed at any of the "holes"
    // over the focused elements - regardless of the mask bands below only
    // painting around them.
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="pointer-events-none fixed inset-0 z-[200] outline-none"
      onKeyDown={onOverlayKeyDown}
    >
      {/* No visible dialog box - the step's title/body still exist (see
          tutorial.ts) for accessibility and for the narration-script
          handoff doc, but on screen the voice alone carries them. This
          live region keeps that text available to screen readers even
          though nothing shows it visually. */}
      <div className="sr-only" aria-live="polite">
        {step.title}. {step.body}
      </div>
      {/* Blurred + dimmed bands cover everything that isn't currently in
          focus - real, clickable holes left over each focused element
          rather than a single dim overlay. Kept light (a quarter of the
          original blur strength) so the rest of the app stays legible in
          the background. Suppressed entirely for suppressBlurMs. */}
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
              element's own shape (targetRadius). Amber rather than the
              app's existing accent colors (red is reserved for low-stock
              warnings, green for "all clear"). Stays visible even while
              blur is suppressed - it's still exactly what's being
              narrated, the only thing changing is whether the rest of the
              screen dims around it. */}
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

      {/* Corner HUD: voice mute toggle, an optional sound bar, step
          counter, back, next/move-on, and skip/exit. Draggable anywhere on
          its own background (not on one of its buttons) - see
          onHudPointerDown/Move/Up above. Positioned via hudPos once the
          customer has moved it at least once; otherwise the original
          top-right corner default. */}
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
        {step.showSoundBar && (
          <div className="px-0.5">
            <TutorialSoundBar speaking={speaking && voiceEnabled} />
          </div>
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
        {step.moveOnLabel ? (
          <button
            onClick={advance}
            aria-label={nextLabel}
            className="rounded-full bg-amber-400/90 px-2 py-1 text-[11px] font-semibold text-neutral-900 hover:bg-amber-300"
          >
            {nextLabel}
          </button>
        ) : (
          <button
            onClick={advance}
            aria-label={nextLabel}
            className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <ChevronRight size={14} />
          </button>
        )}
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
