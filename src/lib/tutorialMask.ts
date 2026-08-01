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
