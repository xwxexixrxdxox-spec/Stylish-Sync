"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { HUD_CORNER_CLASS, pickHudCorner, type HudCorner, type Rect } from "@/lib/tutorialMask";

// Keeps the tour's control pill out from under whatever the current step is
// glowing at. Shared by both overlays because they render byte-identical
// HUDs and this is the kind of behaviour that silently rots the moment two
// copies of it exist. The reasoning for the placement rules themselves lives
// with pickHudCorner in lib/tutorialMask.ts.
//
// `manuallyPlaced` is the customer having dragged the pill somewhere. When
// that is true this hook does nothing at all and the caller positions the
// pill from its own saved coordinates - a deliberate placement is not
// something an overlap heuristic gets to second-guess.
//
// Returns the Tailwind classes for the chosen corner, or "" when the caller
// is positioning the pill itself.
export function useHudCorner(
  hudRef: RefObject<HTMLDivElement | null>,
  glowRect: Rect | null,
  manuallyPlaced: boolean,
): string {
  const [corner, setCorner] = useState<HudCorner>("top-right");
  // Read inside the effect so `corner` itself doesn't have to be a
  // dependency; it would re-run the effect on every hop for no benefit.
  const cornerRef = useRef<HudCorner>("top-right");
  cornerRef.current = corner;

  // Depend on the rect's numbers rather than the object: glowRect is rebuilt
  // fresh every render, so an object dependency would re-measure on every
  // single render of the tour.
  const top = glowRect?.top ?? null;
  const left = glowRect?.left ?? null;
  const width = glowRect?.width ?? null;
  const height = glowRect?.height ?? null;

  // A counter the resize listener bumps to force a re-evaluation, since a
  // rotation changes which corners the same glow blocks without changing any
  // of the numbers above.
  const [viewportTick, setViewportTick] = useState(0);
  useEffect(() => {
    const onResize = () => setViewportTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Layout effect rather than a plain one: this runs after the glow's rect is
  // known but before the browser paints, so the pill is already in its new
  // corner on the first frame the customer sees. As an effect it would flash
  // in the old corner first.
  useLayoutEffect(() => {
    if (manuallyPlaced) return;
    const hud = hudRef.current;
    if (!hud) return;
    const next = pickHudCorner({
      glow: top === null || left === null || width === null || height === null
        ? null
        : { top, left, width, height },
      hudW: hud.offsetWidth,
      hudH: hud.offsetHeight,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      current: cornerRef.current,
    });
    if (next !== cornerRef.current) setCorner(next);
  }, [hudRef, manuallyPlaced, top, left, width, height, viewportTick]);

  return manuallyPlaced ? "" : HUD_CORNER_CLASS[corner];
}
