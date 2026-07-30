// Shared geometry for both tour overlays' masking layer (TutorialOverlay.tsx
// and PropertyTutorialOverlay.tsx). Kept out of either component since it's
// pure math, not presentation - both files can reuse it without repeating
// the "presentational JSX stays duplicated" tradeoff documented in
// PropertyTutorialOverlay.tsx's own top comment.
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Inflates a rect by `pad` px on every side - the small gap the mask leaves
// around a focus element, matching the glow ring's own PAD gap so the two
// stay visually aligned.
export function inflateRect(r: Rect, pad: number): Rect {
  return {
    top: r.top - pad,
    left: r.left - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// Splits the viewport into a grid using every hole's edges as cut lines,
// then returns every grid cell that doesn't fall inside any hole - the set
// of rectangles that still need to be blurred/dimmed. This generalizes the
// overlay's original design (four bands - top/bottom/left/right - cut around
// exactly one hole) to any number of holes anywhere on screen, which is what
// a step needs once it keeps more than one element in focus at once (e.g.
// "reorder" keeps its item card AND its Share button sharp, while the page's
// own descriptive text in between them still blurs). Not a general polygon
// algorithm - holes are assumed axis-aligned (always true, they all come
// from getBoundingClientRect()) and may freely overlap or touch. An empty
// `holes` array returns one band covering the whole viewport, so callers
// don't need a separate "nothing to spotlight" branch.
export function computeMaskBands(holes: Rect[], viewportWidth: number, viewportHeight: number): Rect[] {
  if (viewportWidth <= 0 || viewportHeight <= 0) return [];
  if (holes.length === 0) {
    return [{ top: 0, left: 0, width: viewportWidth, height: viewportHeight }];
  }

  const xsSet = new Set<number>([0, viewportWidth]);
  const ysSet = new Set<number>([0, viewportHeight]);
  for (const h of holes) {
    xsSet.add(clamp(h.left, 0, viewportWidth));
    xsSet.add(clamp(h.left + h.width, 0, viewportWidth));
    ysSet.add(clamp(h.top, 0, viewportHeight));
    ysSet.add(clamp(h.top + h.height, 0, viewportHeight));
  }
  const xs = Array.from(xsSet).sort((a, b) => a - b);
  const ys = Array.from(ysSet).sort((a, b) => a - b);

  const bands: Rect[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const left = xs[i];
    const width = xs[i + 1] - left;
    if (width <= 0) continue;
    for (let j = 0; j < ys.length - 1; j++) {
      const top = ys[j];
      const height = ys[j + 1] - top;
      if (height <= 0) continue;
      const cx = left + width / 2;
      const cy = top + height / 2;
      const insideHole = holes.some(
        (h) => cx >= h.left && cx <= h.left + h.width && cy >= h.top && cy <= h.top + h.height
      );
      if (!insideHole) bands.push({ top, left, width, height });
    }
  }
  return bands;
}
