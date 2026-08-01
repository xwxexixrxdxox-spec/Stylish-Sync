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

// A spotlight hole that also knows how round its own corners are, so the
// cutout can match the real control's shape (a circular icon button gets a
// circular hole, not a rounded square around it).
export interface MaskHole extends Rect {
  radius?: number;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// One rounded-rectangle subpath, drawn clockwise.
function holeSubpath(h: MaskHole): string | null {
  const left = round(h.left);
  const top = round(h.top);
  const w = round(h.width);
  const hh = round(h.height);
  if (w <= 0 || hh <= 0) return null;
  const r = round(clamp(h.radius ?? 12, 0, Math.min(w / 2, hh / 2)));
  const right = round(left + w);
  const bottom = round(top + hh);
  if (r <= 0) {
    return `M${left} ${top} H${right} V${bottom} H${left} Z`;
  }
  return [
    `M${round(left + r)} ${top}`,
    `H${round(right - r)}`,
    `A${r} ${r} 0 0 1 ${right} ${round(top + r)}`,
    `V${round(bottom - r)}`,
    `A${r} ${r} 0 0 1 ${round(right - r)} ${bottom}`,
    `H${round(left + r)}`,
    `A${r} ${r} 0 0 1 ${left} ${round(bottom - r)}`,
    `V${round(top + r)}`,
    `A${r} ${r} 0 0 1 ${round(left + r)} ${top}`,
    "Z",
  ].join(" ");
}

function rectsOverlap(a: MaskHole, b: MaskHole): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

// True when `outerHole` fully encloses `innerHole`.
function rectContains(outerHole: MaskHole, innerHole: MaskHole): boolean {
  return (
    innerHole.left >= outerHole.left &&
    innerHole.top >= outerHole.top &&
    innerHole.left + innerHole.width <= outerHole.left + outerHole.width &&
    innerHole.top + innerHole.height <= outerHole.top + outerHole.height
  );
}

// The bounding box of two holes, keeping the rounder of the two corners.
function unionRect(a: MaskHole, b: MaskHole): MaskHole {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.left + a.width, b.left + b.width);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    radius: Math.max(a.radius ?? 12, b.radius ?? 12),
  };
}

// Collapses overlapping holes into single non-overlapping ones.
//
// This is not a tidy-up, it's a correctness requirement of the even-odd fill
// rule below: even-odd fills wherever the crossing count is odd, so the outer
// viewport rect (1) minus one hole (2) reads "even" and clears, but a point
// sitting inside TWO holes reads (3) - odd again - and gets re-filled. The
// result on screen is a solid dark rectangle sitting *inside* an otherwise
// clear spotlight, which is exactly the "black bar" reported on the Reorder
// step: that step glows `reorder-low-stock-text`, which is nested inside the
// `reorder-item-card` it also keeps in focus, so the two holes were bound to
// overlap. Any step that spotlights a control inside a card it also focuses
// hits this, so it's fixed here in the geometry rather than by hand-picking
// selectors that happen not to nest.
//
// Containment keeps the enclosing hole (the card stays clear, and the glow
// ring is drawn as its own element so the inner target is still highlighted);
// a partial overlap falls back to the bounding box, which exposes slightly
// more than asked for but never draws a bar. Merging restarts from the top
// because a freshly merged rect can reach holes that neither original did.
export function mergeOverlappingHoles(holes: MaskHole[]): MaskHole[] {
  const merged: MaskHole[] = [];
  for (const hole of holes) {
    let current = hole;
    let i = 0;
    while (i < merged.length) {
      const other = merged[i];
      if (rectsOverlap(current, other)) {
        current = rectContains(other, current)
          ? other
          : rectContains(current, other)
            ? current
            : unionRect(current, other);
        merged.splice(i, 1);
        i = 0;
      } else {
        i++;
      }
    }
    merged.push(current);
  }
  return merged;
}

// Builds a single `clip-path` value: the whole viewport, with each hole
// punched out of it by the even-odd fill rule.
//
// This replaces computeMaskBands() for the main tour. Tiling the dim out of
// separate rectangles meant each band applied its own backdrop-filter, so
// wherever two bands abutted the blur doubled and drew a visible bright
// seam - a full-height and full-width cross through the page on a typical
// step, four separate lines on the Reorder share step. Band counts also
// swung between zero and seventeen across the tour, and at zero there was no
// dim at all. One element with one filter has no seams to draw and no count
// to get wrong.
//
// Returns null when there's no viewport to speak of yet (server render, or a
// measurement taken before layout), which callers read as "don't clip."
export function buildMaskClipPath(
  holes: MaskHole[],
  viewportWidth: number,
  viewportHeight: number
): string | null {
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;
  const outer = `M0 0 H${round(viewportWidth)} V${round(viewportHeight)} H0 Z`;
  const inner = mergeOverlappingHoles(holes)
    .map((h) =>
      holeSubpath({
        ...h,
        left: clamp(h.left, -viewportWidth, viewportWidth * 2),
        top: clamp(h.top, -viewportHeight, viewportHeight * 2),
      })
    )
    .filter((d): d is string => d !== null);
  return `path(evenodd, "${[outer, ...inner].join(" ")}")`;
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
