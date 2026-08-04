// Shared geometry for both tour overlays (TutorialOverlay.tsx and
// PropertyTutorialOverlay.tsx). Kept out of either component since it's pure
// math, not presentation - both files can reuse it without repeating the
// "presentational JSX stays duplicated" tradeoff documented in
// PropertyTutorialOverlay.tsx's own top comment.
//
// This file used to be much bigger. It carried the whole masking layer: a
// clip-path builder (buildMaskClipPath + mergeOverlappingHoles + the MaskHole
// type, used by the main tour) and a four-band splitter (computeMaskBands,
// used by the property tour), both of which drew a dimmed, blurred sheet over
// everything except the step's current target.
//
// That mask is gone on purpose. The customer's note: "removing the blur and
// removing the locked state of the page would help make the tutorial feel more
// alive... the customer will see the page as they would in a live setting but
// during the tutorial the buttons that are being narrated get the pulsating
// glow." The dim was also the click-lock - the mask sheet carried
// pointer-events-auto, so anything it painted over was genuinely dead to the
// touch. Deleting it made the page live for free.
//
// What survives is just the rect math the amber glow rings still need. If a
// dim is ever wanted again, it belongs behind a per-step opt-in rather than as
// the default, and it should be rebuilt from scratch rather than resurrected
// from git history - the old version assumed it also owned hit testing.
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Inflates a rect by `pad` px on every side - the small gap the glow ring
// leaves around the spotlighted control, so the ring hugs the element's own
// edges rather than sitting directly on top of them.
export function inflateRect(r: Rect, pad: number): Rect {
  return {
    top: r.top - pad,
    left: r.left - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
}

// --- HUD corner placement -------------------------------------------------
//
// The control pill parks in a corner, and for most of the tour that is fine.
// It stops being fine the moment a step narrates something that lives in the
// same corner: the account gear and the tour launcher both sit top-right, so
// the pill was landing squarely on top of the one control the voice was
// telling the customer to press. Their note: the HUD should never cover the
// element being narrated.
//
// Dragging already existed as the manual escape hatch, but asking someone to
// move the furniture before they can follow an instruction is the kind of
// thing that only reads as reasonable to whoever built it. So the pill picks
// its own corner: it stays where it is while that corner is clear, and hops
// to the nearest clear one when the glow arrives underneath it. A customer
// who has dragged it somewhere deliberately is never overridden - that
// choice outranks this heuristic, because they can see the screen and this
// function cannot.

export type HudCorner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

// Tailwind positioning for each corner. Kept beside the math so a new corner
// can't be added in one place and forgotten in the other.
export const HUD_CORNER_CLASS: Record<HudCorner, string> = {
  "top-right": "right-3 top-3",
  "top-left": "left-3 top-3",
  "bottom-right": "right-3 bottom-3",
  "bottom-left": "left-3 bottom-3",
};

// Matches the `3` in the classes above (0.75rem).
const HUD_INSET_PX = 12;

// Where a corner's pill actually sits, given its measured size. Needed
// because overlap has to be tested against real geometry, not against the
// class name.
export function hudCornerRect(
  corner: HudCorner,
  hudW: number,
  hudH: number,
  viewportW: number,
  viewportH: number,
): Rect {
  const left = corner.endsWith("right") ? viewportW - HUD_INSET_PX - hudW : HUD_INSET_PX;
  const top = corner.startsWith("top") ? HUD_INSET_PX : viewportH - HUD_INSET_PX - hudH;
  return { top, left, width: hudW, height: hudH };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

// Preference order when the current corner is blocked. Top-right first
// because that is where the pill has always lived and where returning
// customers will look for it; the bottom pair last because the page's own
// content sits lower on a phone and a pill down there reads as part of the
// app rather than as tour furniture.
const CORNER_ORDER: HudCorner[] = ["top-right", "top-left", "bottom-right", "bottom-left"];

// Picks the corner the pill should occupy. `current` is tried first and wins
// ties, which is what stops the pill flickering between two equally-valid
// corners as a rect settles over its first few frames.
//
// `clearance` widens the glow before testing, so the pill lands beside the
// highlighted control rather than flush against it - touching is not
// covering, but at a thumb's width apart it may as well be.
//
// If every corner is blocked (a glow spanning the whole viewport, e.g. a
// full-width card on a small phone) it returns `current` unchanged. Moving
// the pill from one covered corner to another covered corner buys nothing
// and just looks like a glitch; the customer can still drag it.
export function pickHudCorner(opts: {
  glow: Rect | null;
  hudW: number;
  hudH: number;
  viewportW: number;
  viewportH: number;
  current: HudCorner;
  clearance?: number;
}): HudCorner {
  const { glow, hudW, hudH, viewportW, viewportH, current, clearance = 12 } = opts;
  // Nothing highlighted (a welcome step, or a target that never resolved) -
  // go home. Otherwise the pill would stay parked wherever the last step
  // pushed it, which looks like it drifted on its own.
  if (!glow || hudW <= 0 || hudH <= 0) return "top-right";
  const blocked = inflateRect(glow, clearance);
  const candidates = [current, ...CORNER_ORDER.filter((c) => c !== current)];
  for (const corner of candidates) {
    if (!rectsOverlap(hudCornerRect(corner, hudW, hudH, viewportW, viewportH), blocked)) {
      return corner;
    }
  }
  return current;
}
