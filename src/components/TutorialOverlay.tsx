"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX, X } from "lucide-react";
import { TUTORIAL_STEPS, waitForElement } from "@/lib/tutorial";
import {
  getCookieConsent,
  setTutorialCompleted,
  getTutorialVoiceEnabled,
  setTutorialVoiceEnabled,
} from "@/lib/storage";
import { computeMaskBands, inflateRect, type Rect } from "@/lib/tutorialMask";
import type { TabId } from "./BottomNav";

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
// whatever this step is pointing at. Second generation of this component —
// the original explained each step through a full callout card; this one
// leans on the voice narration (playStepAt below) to do that job instead,
// and puts the visual emphasis on the spotlighted element itself: a
// pulsating, game-style glow (see the tutorial-glow-* keyframes in
// tailwind.config.ts) around whatever the customer needs to interact with,
// with only a small caption bubble alongside it as a readable fallback for
// a muted or autoplay-blocked device. Drives the app's own tab/sidebar
// state directly (rather than rendering fake copies of each screen) so
// what the customer sees during the tour is exactly the real app, not a
// mockup of it.
export default function TutorialOverlay({ tab, setTab, accountOpen, setAccountOpen, sheetId, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  // Measured height of the caption bubble itself, used (alongside the
  // target rect) to decide whether it can sit near the bottom of the screen
  // without covering the very thing it's pointing at - see the
  // captionNearTop comment near the render below. Seeded with a reasonable
  // guess close to a typical caption's real height so the very first paint
  // (before the ResizeObserver below reports in) is already close, rather
  // than assuming 0.
  const [captionHeight, setCaptionHeight] = useState(90);
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
  // Wraps every focusable control this step renders (the corner pill's
  // mute/skip buttons, the caption's own Next button) - queried by
  // onOverlayKeyDown below for the Tab focus trap, since those controls now
  // live in two visually separate pieces rather than one callout card.
  const overlayRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
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

  // Covers a gap in playStepAt's own phase2FallbackMs: that timer only ever
  // gets scheduled as a side effect of playStepAt() actually running, but
  // playStepAt() is never called at all while voiceEnabled is false (see
  // advance() and the mount-only effect below, both gated on it) - so a
  // customer who has the tour muted for a step's entire duration would
  // never see the glow move to targetSelectorPhase2, no matter how long
  // they waited. That defeats the point of a step like "reorder" tracking
  // what's being said - the caption still names Share, but the glow itself
  // would stay stuck on the low-stock text forever. This schedules the
  // exact same switch independently whenever voice is already off the
  // moment this step starts, so a fully-muted customer still gets it.
  // (Toggling voice on mid-step re-runs this effect, sees voiceEnabled is
  // now true, and cleans up without scheduling - playStepAt's own
  // audio-driven switch takes over from there.)
  useEffect(() => {
    if (voiceEnabled || !step.targetSelectorPhase2) return;
    const timer = window.setTimeout(() => {
      switchTarget(step.targetSelectorPhase2!);
    }, step.phase2FallbackMs ?? 4000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, voiceEnabled]);

  // Send focus into the caption bubble each time a new step appears, so
  // keyboard/screen-reader users land somewhere inside the dialog instead
  // of wherever focus happened to be on the underlying page (which, for a
  // spotlighted step, might not even be visible under the dim mask).
  useEffect(() => {
    captionRef.current?.focus();
  }, [stepIndex]);

  // Keeps captionHeight (see above) in sync with the caption's real
  // rendered height, for every step - body text length varies a lot step to
  // step ("Go ahead and tap..." vs. the three-line reorder explanation), and
  // a step's caption can also reflow if the viewport resizes underneath it.
  // This was worth doing after finding, while live-testing the old card
  // version's "support" step, that a tall spotlight target (the whole chat
  // widget, stretching almost to the bottom of the screen) let a
  // bottom-anchored callout overlap the real chat input it was supposed to
  // leave clickable - the caption's actual height matters for detecting
  // that, not just a guess, and still applies now that it's a smaller
  // bubble rather than a full card.
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

  // A minimal focus trap: Tab/Shift+Tab cycles only among this step's own
  // focusable elements - the corner pill's mute/skip buttons and the
  // caption's Next button, now split across two visually separate pieces
  // rather than one card, so this queries the whole overlay rather than a
  // single container - instead of escaping into whatever sits behind the
  // dimmed mask, standard expected behavior for anything marked aria-modal.
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
  // Near-bottom is the default (matches "bottom-24" in the JSX below, which
  // reserves BOTTOM_CAPTION_CLEARANCE px so the caption clears the bottom
  // nav) - near-top only kicks in when that default would actually collide
  // with something: either the target itself starts in the lower half (the
  // original heuristic - e.g. the account-gear/google-signin steps, whose
  // target sits low on screen), or, regardless of where the target
  // *starts*, its own bottom edge reaches far enough down to land inside
  // the zone a bottom-anchored caption would occupy - true for any tall
  // target, like the "support" step's whole-chat-widget spotlight, which
  // starts near the top but stretches down past where the caption would
  // sit. Checking only rect.top (the original logic) missed that second
  // case entirely.
  const BOTTOM_CAPTION_CLEARANCE = 96; // px - matches bottom-24 below
  const captionNearTop = rect
    ? rect.top > window.innerHeight / 2 ||
      rect.top + rect.height + PAD > window.innerHeight - BOTTOM_CAPTION_CLEARANCE - captionHeight
    : false;
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
    // pill, the caption bubble) opts back into pointer-events-auto
    // individually; the real elements under the holes are never covered by
    // anything here, so they fall through to receive clicks normally.
    <div ref={overlayRef} className="pointer-events-none fixed inset-0 z-[200]" onKeyDown={onOverlayKeyDown}>
      {/* Blurred + dimmed bands cover everything that isn't currently in
          focus, real, clickable holes left over each focused element rather
          than a single dim overlay - see computeMaskBands. Blurring (rather
          than the old flat dim) is what makes the in-focus elements read as
          in-focus: everything else visibly falls out of focus around them,
          the same depth-of-field cue a game uses to say "look here." */}
      {maskBands.map((band, i) => (
        <div
          key={i}
          className="pointer-events-auto fixed bg-black/45 backdrop-blur-md transition-all duration-200"
          style={{ top: band.top, left: band.left, width: band.width, height: band.height }}
        />
      ))}
      {glowRect && (
        <>
          {/* The "quest marker" glow: an expanding, fading ping ring behind
              a breathing blurred-glow ring, around whichever element the
              narration is currently talking about. Amber rather than the
              app's existing accent colors (red is reserved for low-stock
              warnings, green for "all clear") - a color that reads as
              "here, this one" without also reading as a status. */}
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

      {/* Minimal corner HUD: step counter, voice mute toggle, and skip/exit
          - everything the old callout card's button row held that isn't
          "what do I do right now" (that lives in the caption below,
          anchored to the glow itself). Fixed in the corner rather than
          following the spotlight, so it reads as a persistent status
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
          onClick={() => finish("skipped")}
          aria-label="Skip tour"
          className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {/* The caption: a small, game-dialogue-style bubble anchored near the
          glow (or centered, for the one step with nothing to point at yet -
          "welcome"). Replaces the old full callout card's prose - the voice
          narration (playStepAt above) carries the actual explanation now,
          so this only needs to hold a short readable fallback for a muted
          or autoplay-blocked device, plus the one control every step still
          needs regardless of whether it self-resolves: a way to move on. */}
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
