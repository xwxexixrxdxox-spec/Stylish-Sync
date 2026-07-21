"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TUTORIAL_STEPS, waitForElement } from "@/lib/tutorial";
import { getCookieConsent, setTutorialCompleted } from "@/lib/storage";
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
  const targetElRef = useRef<HTMLElement | null>(null);
  // Frozen once at mount (useState initializer, not useMemo) on purpose:
  // the cookie-consent step only belongs in the tour while consent is still
  // undecided, but consent gets decided DURING that very step — recomputing
  // the list at that moment would shift every later step's index mid-tour.
  const [steps] = useState(() =>
    TUTORIAL_STEPS.filter((s) => s.id !== "cookie-consent" || getCookieConsent() === null)
  );
  const step = steps[stepIndex];

  const finish = (reason: "finished" | "skipped") => {
    setTutorialCompleted(reason);
    onClose();
  };

  const advance = () => {
    setStepIndex((i) => {
      if (i >= steps.length - 1) {
        setTutorialCompleted("finished");
        onClose();
        return i;
      }
      return i + 1;
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
      if (el) setRect(el.getBoundingClientRect());
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

  if (typeof document === "undefined") return null;

  const nextLabel = step.nextLabel ?? "Next";
  const cardNearTop = rect ? rect.top > window.innerHeight / 2 : false;

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
        <div role="dialog" aria-label={step.title} className="w-full max-w-sm animate-tutorial-card-in rounded-xl2 bg-white p-4 shadow-card">
          <p className="text-sm font-semibold text-neutral-900">{step.title}</p>
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
