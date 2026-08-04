"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Volume2, VolumeX, X } from "lucide-react";
import { TUTORIAL_STEPS, waitForElement, type TutorialStep } from "@/lib/tutorial";
import {
  getCookieConsent,
  setTutorialCompleted,
  getTutorialVoiceEnabled,
  setTutorialVoiceEnabled,
} from "@/lib/storage";
import { inflateRect, type Rect } from "@/lib/tutorialMask";
import { useHudCorner } from "./useHudCorner";
import TutorialVoiceWave from "./TutorialVoiceWave";
import type { TabId } from "./BottomNav";

// Gap between the spotlighted element and the glow ring around it, in px.
// Kept small on purpose (third generation of this component - see the
// top-level comment below) so the glow hugs the real element's own edges
// rather than reading as a padded box drawn around it.
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
  // Reports HOW the tour ended, so page.tsx can show a short confirmation
  // for a genuine finish and stay quiet for a skip.
  onClose: (reason: "finished" | "skipped") => void;
  // Reports the id of whichever step is currently showing (or null once
  // the tour closes) - page.tsx uses this to make a couple of real
  // features tutorial-aware without this component needing to know
  // anything about them itself: the header's clear-cache button goes into
  // a dud/no-op mode for the tutorial's own duration (see ClearCacheButton
  // tutorialDud), and the Usage tab narrows its overview list to one item
  // only while this tour's own "usage" step is showing.
  onStepChange?: (id: string | null) => void;
}

// Coach-mark style walkthrough: a pulsating glow on whatever control this
// step is currently narrating, drawn over the real, fully live app. Third
// generation of this
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

// Titles are written as headlines and often end in their own punctuation
// ("That's the tour!"), so joining title and body with a full stop produced
// "That's the tour!. You're all set" - which any screen reader or TTS pass
// dutifully reads as a doubled stop.
function stripTrailingPunctuation(s: string): string {
  return s.replace(/[.!?,;:\s]+$/u, "");
}

// Does this step actually have a recorded voice clip on the server?
//
// Since the visible dialog cards were removed, the recording is a step's
// ONLY explanation - so a step whose clip 404s shows one amber glow and
// total silence, and nothing else. Twenty-one of the thirty-two steps were in
// that state, which is what made the tour miserable rather than merely
// rough. Rather than show them, the tour asks the server up front which
// clips exist and quietly drops the rest: a short tour that talks beats a
// long one that doesn't, and a future missing file now degrades quietly
// instead of producing another silent wall.
//
// A network/CORS failure returns true, not false - "I couldn't ask" must
// never be mistaken for "it isn't there," or one flaky moment would gut the
// whole tour.
async function hasNarration(stepId: string): Promise<boolean> {
  try {
    const res = await fetch(`/audio/tutorial/${stepId}.mp3`, { method: "HEAD" });
    return res.ok;
  } catch {
    return true;
  }
}

// Thin wrapper that resolves the step list BEFORE the real overlay mounts,
// then hands it down as a prop. Deliberately a separate component rather
// than a piece of state inside the overlay: roughly ten of the overlay's
// effects are keyed on [stepIndex], and stepIndex stays 0 while an async
// step list resolves - so those effects would never re-run once it landed,
// and step 1's narration would never play. Mounting the overlay only once
// the list is final means every one of its hooks starts life with a stable,
// non-null array and none of them need to know this happened at all.
export default function TutorialOverlay(props: Props) {
  const [steps, setSteps] = useState<TutorialStep[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The cookie-consent step only belongs in the tour while consent is
    // still undecided - consent gets decided DURING that very step, so this
    // is settled once, here, and never recomputed mid-tour.
    const candidates = TUTORIAL_STEPS.filter(
      (s) => s.id !== "cookie-consent" || getCookieConsent() === null
    );
    Promise.all(candidates.map((s) => hasNarration(s.id))).then((present) => {
      if (cancelled) return;
      // The closing step is exempt from the drop. It is the only step in the
      // tour that isn't teaching a control - it's the goodbye - and it now
      // has a *visible* sign-off waiting for it (the confirmation the page
      // shows once the tour reports "finished"), so it doesn't need a voice
      // clip to do its job. Without this exemption the last surviving step
      // would be whichever teaching step happens to be last on disk, and
      // today that's "Start Fresh" - so a brand new customer's tour would end
      // with the wipe-everything button spotlit and then nothing. A quiet
      // beat that says "you're done" is a much better last impression.
      const narratable = candidates.filter((_, i) => present[i]);
      // If literally nothing came back present, something is wrong with the
      // request rather than with the audio - fall back to the full list so
      // the customer gets the old behaviour rather than an empty tour. Tested
      // on `narratable` specifically, before the exemption below, so a tour
      // consisting of nothing but the goodbye never counts as a real result.
      if (!narratable.length) {
        setSteps(candidates);
        return;
      }
      setSteps(
        candidates.filter((s, i) => present[i] || s.id === "tour-complete")
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!steps) return null;
  return <TutorialOverlayInner {...props} steps={steps} />;
}

function TutorialOverlayInner({ tab, setTab, accountOpen, setAccountOpen, sheetId, onClose, onStepChange, steps }: Props & { steps: TutorialStep[] }) {
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
  // Where the glow lives when nothing is temporarily borrowing it. Written
  // by every ordinary attach (the step's own target, and its phase-2
  // handoff); read only when a retargetWhilePresent element goes away and
  // the glow needs somewhere to go home to. See the retarget effect below.
  const baseTargetRef = useRef<HTMLElement | null>(null);
  // True while a retargetWhilePresent element currently owns the glow. A ref
  // rather than state because the two places that read it are async
  // callbacks (a waitForElement promise, a phase-2 timer) that would
  // otherwise close over a stale value and yank the glow back off the thing
  // the customer just opened.
  const retargetedRef = useRef(false);
  // False once this component unmounts - checked by the rAF loop in
  // settleRect(), which would otherwise keep calling setState on a tour that
  // has already closed.
  const aliveRef = useRef(true);
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
  // Which direction the customer arrived at the current step from. Three
  // steps advance themselves once the real thing is done (cookie consent
  // chosen, a scan lookup resolved, the usage detail view opened), and
  // their "is it done yet?" check re-runs the instant the step is entered.
  // Entered BACKWARDS - i.e. the customer pressed the back arrow to hear it
  // again - the answer is permanently yes, so the step immediately fires
  // "done, move forward" and throws them straight back where they came
  // from. That's the loop: from step 21 onward the back arrow was dead.
  // Those checks read this ref and stay quiet when the arrival was
  // backwards; a step you've already satisfied should sit still and let you
  // listen to it again. Deliberately NOT read by the account-gear or
  // google-signin checks: those key off live app state (accountOpen,
  // sheetId) rather than a permanently-true fact, and backing into
  // account-gear closes the sidebar again anyway, so they self-correct.
  const enteredBackwardsRef = useRef(false);
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
  // TutorialVoiceWave on the one step that shows one (see
  // step.showSoundBar). Tracked via the real <audio> element's own
  // play/pause/ended events rather than inferred from stepIndex, so it
  // stays correct through mute/unmute and a clip actually finishing.
  const [speaking, setSpeaking] = useState(false);
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
  // `steps` arrives already narrowed and frozen by the wrapper above - it
  // never changes identity for this component's whole lifetime, so every
  // [stepIndex]-keyed effect below can treat it as a constant.
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

  // Ending the tour used to just make the overlay vanish, leaving the
  // customer sitting inside the Account settings sidebar - the last place
  // the tour navigated to, not anywhere anyone would want to start working,
  // and with nothing to confirm they'd actually finished. Completing it now
  // closes the sidebar and puts them back on Inventory; page.tsx shows the
  // brief confirmation from there. Skipping is left exactly where they are,
  // since someone bailing out mid-tour usually wants the screen they bailed
  // out on.
  const finish = (reason: "finished" | "skipped") => {
    setTutorialCompleted(reason);
    audioRef.current?.pause();
    if (reason === "finished") {
      setAccountOpen(false);
      setTab("inventory");
    }
    onClose(reason);
  };

  const advance = () => {
    if (hasAdvancedRef.current) return;
    hasAdvancedRef.current = true;
    enteredBackwardsRef.current = false;
    setStepIndex((i) => {
      if (i >= steps.length - 1) {
        finish("finished");
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
    enteredBackwardsRef.current = true;
    setStepIndex((i) => {
      if (i <= 0) {
        hasAdvancedRef.current = false;
        enteredBackwardsRef.current = false;
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
  //
  // `isRetarget` marks the temporary kind of attach - a retargetWhilePresent
  // element borrowing the glow for as long as it exists. Those deliberately
  // do not become the step's home, so that closing the menu can hand the
  // glow back to the control that opened it.
  const attachTarget = (el: HTMLElement, isRetarget = false) => {
    if (!isRetarget) baseTargetRef.current = el;
    resizeObserverRef.current?.disconnect();
    targetElRef.current = el;
    setRect(el.getBoundingClientRect());
    const style = window.getComputedStyle(el);
    setTargetRadius(style.borderRadius || "0.75rem");
    // Nothing dims the rest of the page any more, so a target that's
    // scrolled out of view would leave the customer looking at a screen
    // with no glow on it at all. Centering it is the whole "look here."
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const observer = new ResizeObserver(() => {
      if (targetElRef.current) setRect(targetElRef.current.getBoundingClientRect());
    });
    observer.observe(el);
    resizeObserverRef.current = observer;
    settleRect(el);
  };

  // Follow a target that's still moving when we first measure it.
  //
  // The account sidebar slides in over about two seconds, and a
  // ResizeObserver only fires on size changes - a panel translating into
  // place keeps its size the whole way, so the spotlight was measured at the
  // panel's off-screen starting position (I measured a hole at x=1949 on a
  // 1920-wide viewport) and sat there until some unrelated recompute
  // happened to correct it. Re-measuring every frame for a beat, and only
  // committing state when the numbers actually change, makes the glow travel
  // with the panel instead of arriving late.
  const settleRect = (el: HTMLElement, ms = 1600) => {
    let elapsed = 0;
    let last = "";
    const tick = () => {
      if (!aliveRef.current || targetElRef.current !== el) return;
      const r = el.getBoundingClientRect();
      const key = `${r.top},${r.left},${r.width},${r.height}`;
      if (key !== last) {
        last = key;
        setRect(r);
      }
      elapsed += 16;
      if (elapsed < ms) window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  };

  // Find (and re-find, once the tab/sidebar effect above actually lands)
  // this step's spotlight target.
  //
  // When the target genuinely never turns up, the step is skipped in
  // whichever direction the customer was already travelling. Three steps
  // (break down a case, Push to Sheet, Pull from Sheet) point at controls
  // that only exist under conditions a first-time customer may not have met,
  // and a step with no target used to render as a single grey rectangle over
  // part of the page - it looked like the app had crashed mid-render. Moving
  // past it is both honest and quiet. Skipping in the direction of travel
  // matters: skipping forward while someone is pressing Back is its own
  // little trap.
  useEffect(() => {
    let cancelled = false;
    const enteredBackwards = enteredBackwardsRef.current;
    setRect(null);
    targetElRef.current = null;
    baseTargetRef.current = null;
    retargetedRef.current = false;
    resizeObserverRef.current?.disconnect();
    if (!step.targetSelector) return;
    // Generous timeout: the sidebar's own transition can take most of two
    // seconds, and a step inside it shouldn't be dropped for being slow.
    waitForElement(step.targetSelector, 2500).then((el) => {
      if (cancelled) return;
      if (el) {
        // Checked here rather than before the wait above, and checked
        // synchronously, because by the time the target has been found the
        // sidebar around it has finished rendering - so a gate that is going
        // to match already does, and one that does not never will. Doing it
        // first would mean sitting through a second timeout for the common
        // case of a gate that is simply absent. See
        // TutorialStep.requiresSelector in tutorial.ts.
        if (step.requiresSelector) {
          const negated = step.requiresSelector.startsWith("!");
          const gate = negated ? step.requiresSelector.slice(1) : step.requiresSelector;
          if (!!document.querySelector(gate) === negated) {
            if (enteredBackwards) goBack();
            else advance();
            return;
          }
        }
        // A customer quick enough to open the menu before this promise
        // settles keeps the glow they earned; the target still becomes this
        // step's home, so closing the menu lands somewhere sensible.
        if (retargetedRef.current) baseTargetRef.current = el;
        else attachTarget(el);
        return;
      }
      if (enteredBackwards) goBack();
      else advance();
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
      aliveRef.current = false;
      resizeObserverRef.current?.disconnect();
    };
  }, []);

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

  // "scan" resolves itself once the camera episode is over, which is the
  // customer's own wording for it: "once they exit the camera or scan
  // something, a pulsating glow should land on the barcode information
  // field." Two separate signals get there, both mirrored by ScanTab onto
  // the scan panel (see ScanTab.tsx):
  //
  //   - data-tutorial-scanning going "true" and then back to "false". That
  //     covers a cancelled scan, which resolves no lookup at all and so was
  //     invisible to the older version of this check - a customer who opened
  //     the camera, found nothing to point it at and backed out was left
  //     sitting on a step that had already had its moment.
  //   - data-tutorial-lookup-status landing on a real answer. That covers a
  //     barcode typed into the field by hand, with the camera never opened.
  //
  // A real scan trips both (handleBarcodeDetected calls stopScan first);
  // hasAdvancedRef makes the second one a no-op. The manual Next in the
  // corner HUD still works too, for a customer with nothing on hand to scan
  // right now.
  useEffect(() => {
    if (step.id !== "scan") return;
    // Entered backwards: the lookup already resolved, so this check would
    // fire instantly and bounce the customer forward again. Sit still.
    if (enteredBackwardsRef.current) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    // Latched rather than derived, because "the camera is closed" is also
    // true before it was ever opened - only the transition means anything.
    let cameraWasOpen = false;
    waitForElement('[data-tutorial="scan-panel"]').then((el) => {
      if (cancelled || !el) return;
      const check = () => {
        if (el.getAttribute("data-tutorial-scanning") === "true") {
          cameraWasOpen = true;
          return;
        }
        if (cameraWasOpen) {
          advance();
          return;
        }
        const status = el.getAttribute("data-tutorial-lookup-status") || "idle";
        if (status !== "idle" && status !== "checking") advance();
      };
      check();
      observer = new MutationObserver(check);
      observer.observe(el, {
        attributes: true,
        attributeFilter: ["data-tutorial-lookup-status", "data-tutorial-scanning"],
      });
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // A step can hold itself while the customer is mid-action - see
  // TutorialStep.pauseWhile in tutorial.ts for why, and ScanTab.tsx for the
  // one condition that uses it today. While held, narration pauses where it
  // stands and the glow hides; the HUD stays exactly where it is, because a
  // held step still needs a visible way out.
  //
  // Watches the whole document rather than a known element: the condition is
  // an arbitrary selector, and the element carrying it may not exist yet (or
  // at all) when the step opens.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    setPaused(false);
    const selector = step.pauseWhile;
    if (!selector) return;
    const check = () => setPaused(document.querySelector(selector) !== null);
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Applies that hold to the narration itself. The currentTime guard is what
  // keeps this from restarting a clip it has no business touching: on a step
  // change `paused` resets to false while audioRef has already moved on to
  // the new step's freshly-created clip, which is sitting at 0 and is about
  // to be played (or has just been played) by advance()/goBack() themselves.
  // Only a clip that genuinely got interrupted partway is resumed here.
  //
  // A resume can be refused outright on mobile, since it is not running
  // inside a user gesture - swallowed rather than surfaced, because the step
  // is still on screen and its text is still in the live region.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (paused) {
      audio.pause();
    } else if (voiceEnabled && !audio.ended && audio.currentTime > 0) {
      audio.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

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
    // Entered backwards: the detail view is still open from last time, so
    // the timeframe buttons are still in the DOM and this would bounce
    // straight forward again. Sit still and let the clip replay.
    if (enteredBackwardsRef.current) return;
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
    // Entered backwards: consent was already chosen, and it stays chosen
    // forever, so this poll would re-advance within a quarter second.
    if (enteredBackwardsRef.current) return;
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

  // Moves the spotlight to a new target mid-step, for a step's
  // targetSelectorPhase2 (see tutorial.ts). Only called once per step (the
  // callers that use this each remove their own trigger the moment they
  // fire), so there's no need to guard against re-entrancy here.
  const switchTarget = (selector: string) => {
    waitForElement(selector).then((el) => {
      if (!el) return;
      // Same courtesy as the first-target search above: a phase-2 switch is
      // on a timer, and a timer has no business snatching the glow off a
      // menu the customer has open in front of them. It still becomes the
      // home the glow returns to once they close it.
      if (retargetedRef.current) baseTargetRef.current = el;
      else attachTarget(el);
    });
  };

  // A step can lend its glow to something that only exists while the
  // customer is holding it open - see TutorialStep.retargetWhilePresent in
  // tutorial.ts for the why, and ReorderTab.tsx's reorder-find-at-menu for
  // the case it was built for. Open the store list and the ring grows onto
  // the stores; close it and the ring goes back to the button.
  //
  // Watches document.body rather than a known element, because the whole
  // point is that the element does not exist yet, and may never exist if the
  // customer just listens and taps Next.
  useEffect(() => {
    const selector = step.retargetWhilePresent;
    if (!selector) return;
    const check = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        if (targetElRef.current !== el) {
          retargetedRef.current = true;
          attachTarget(el, true);
        }
        return;
      }
      if (!retargetedRef.current) return;
      retargetedRef.current = false;
      const home = baseTargetRef.current;
      // isConnected: the control that opened the menu may itself have been
      // re-rendered away while the menu was up, and re-attaching to a
      // detached node would pin the glow to a rect frozen at 0,0.
      if (home && home.isConnected) attachTarget(home);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

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

    // Drives TutorialVoiceWave on the step that shows one - real playback
    // state, not just "is this the active step," so muting or a clip
    // ending correctly settles the trace.
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

  // Which corner the control pill parks in, so it never lands on top of the
  // control the voice is currently talking about - the account gear and the
  // tour launcher both live top-right, which is exactly where this went
  // wrong. Returns "" once the customer has dragged the pill themselves;
  // hudPos takes over from there. See useHudCorner.ts.
  //
  // Called up here, above the early return below, because it's a hook and
  // hooks have to run in the same order on every render. The rect is
  // inflated inside rather than reusing `glowRect` further down for the same
  // reason - that constant is computed after the return.
  const hudCornerClass = useHudCorner(hudRef, rect ? inflateRect(rect, PAD) : null, hudPos !== null);

  if (typeof document === "undefined") return null;

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;
  // "Finish tour" is derived from position rather than read off the step,
  // because the step that used to carry that label can now be dropped by the
  // narration preflight - whichever step ends up last has to say it.
  const nextLabel = step.moveOnLabel ?? (isLastStep ? "Finish tour" : step.nextLabel ?? "Next");
  const audioSupported = typeof window !== "undefined" && typeof Audio !== "undefined";
  // How far through the current chapter this step is, e.g. "Inventory 3/9".
  // A raw "1/32" was the very first thing a customer read on step one, and
  // thirty-two is a daunting number to open with; a chapter shows them the
  // end of the section they're in rather than the end of everything. Counted
  // over the steps that actually survived the preflight, so it stays honest.
  const chapter = step.chapter;
  const chapterSteps = chapter ? steps.filter((s) => s.chapter === chapter) : [];
  const chapterPosition = chapter ? chapterSteps.indexOf(step) + 1 : 0;

  // Where the glow rings go: the current target's own rect, padded out a
  // few px so the ring hugs the control's edges rather than sitting on top
  // of them. There is no mask any more (see the top-of-file comment), so
  // this is the only geometry the overlay computes.
  const glowRect = rect ? inflateRect(rect, PAD) : null;

  return createPortal(
    // pointer-events-none here is load-bearing, not decorative: this outer
    // div's own box spans the full viewport at z-[200], so without it the
    // tour would swallow every click on the app underneath. With the dimmed
    // mask gone this is now the ONLY thing standing between the customer
    // and a fully live page - the HUD re-enables pointer events on itself.
    <div className="pointer-events-none fixed inset-0 z-[200] outline-none">
      {/* No visible dialog box - the step's title/body still exist (see
          tutorial.ts) for accessibility and for the narration-script
          handoff doc, but on screen the voice alone carries them. This
          live region keeps that text available to screen readers even
          though nothing shows it visually. */}
      <div className="sr-only" aria-live="polite">
        {`${stripTrailingPunctuation(step.title)}. ${step.body}`}
      </div>
      {/* `!paused` is the other half of a held step (see TutorialStep.pauseWhile
          in tutorial.ts): while the customer is mid-action the glow gets out of
          the way entirely, so an amber ring is never sitting on top of a live
          camera view competing for the same attention. The HUD further down is
          deliberately NOT gated on this, because a held step still needs a
          visible way out. */}
      {glowRect && !paused && (
        <>
          {/* The "quest marker" glow: an expanding, fading ping ring behind
              a breathing blurred-glow ring, hugging the real spotlighted
              element's own shape (targetRadius). Amber rather than the
              app's existing accent colors (red is reserved for low-stock
              warnings, green for "all clear"). With the dim gone this is
              now the tour's ONLY visual affordance, which is exactly the
              point - the page reads as the live app, and the glow is the
              single thing saying "this one." */}
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

      {/* The voice waveform panel - the welcome step only, and the only
          step in this tour with showSoundBar set. It deliberately lives out
          here rather than inside the HUD pill: the HUD is a compact row of
          controls that the customer can drag out of the way, and burying
          the "I'm talking to you" signal inside it made it a 16px
          afterthought. See TutorialVoiceWave.tsx for why it's scoped this
          narrowly. */}
      {step.showSoundBar && <TutorialVoiceWave speaking={speaking && voiceEnabled} />}

      {/* Corner HUD: voice mute toggle, step counter, back, next/move-on,
          and skip/exit. Draggable anywhere on
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
        className={`pointer-events-auto fixed z-[201] flex touch-none select-none items-center gap-0.5 rounded-full bg-neutral-900/80 px-2 py-1 text-white shadow-card backdrop-blur transition-[top,left,right,bottom] duration-300 animate-label-in cursor-grab active:cursor-grabbing ${hudCornerClass}`}
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
        <span className="px-1 text-[11px] text-white/70">
          {chapter && chapterPosition > 0 ? (
            <>
              {chapter}{" "}
              <span className="tabular-nums">
                {chapterPosition}/{chapterSteps.length}
              </span>
            </>
          ) : (
            <span className="tabular-nums">
              {stepIndex + 1}/{steps.length}
            </span>
          )}
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
