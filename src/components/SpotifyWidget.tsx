"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Music2, X, Pencil, Trash2, GripHorizontal, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import {
  getSpotifyLink,
  setSpotifyLink,
  getSpotifyWidgetOpen,
  setSpotifyWidgetOpen,
  parseSpotifyLink,
  getSpotifyWidgetPosition,
  setSpotifyWidgetPosition,
  getSpotifyWidgetDock,
  setSpotifyWidgetDock,
  getSpotifyWidgetCollapsed,
  setSpotifyWidgetCollapsed,
  type SpotifyEmbed,
  type SpotifyWidgetPosition,
  type DockSide,
} from "@/lib/spotifyWidget";
import Tooltip from "./Tooltip";

// Optional "background music" widget, entirely opt-in and per-device (see
// spotifyWidget.ts for the storage/parsing rationale). Draggable anywhere on
// screen as a small floating window, OR dockable to a screen edge (like a
// Windows Snap / Unity panel) where it stretches into a collapsible sidebar
// (left/right) or header/footer bar (top/bottom) - added after the plain
// floating version turned out to still sit on top of other controls no
// matter where it was left, so it needed a way to tuck fully out of the
// content area rather than just being repositioned on top of it. Closed by
// default so a brand-new visitor sees nothing and nothing third-party ever
// loads until they deliberately open this and paste a link themselves.
//
// Mirrors InstallBanner's `suppressed` pattern: hidden (not unmounted state-
// wise, just not rendered) while the onboarding tour has the screen's
// attention, so it can't overlap the tutorial spotlight/callout.
interface Props {
  suppressed?: boolean;
}

// Curated one-tap presets, shown alongside the paste-a-link option - added
// after a customer pointed out that Spotify itself buries "copy link to
// playlist" (an extra menu on desktop web, and easy to never find at all in
// the mobile app), so pasting a link is real friction for anyone who just
// wants *something* playing while they work. These are Spotify's own
// long-running official editorial playlists (chosen for staying power, not
// personal taste) rather than anything hosted by this app - same no-OAuth
// embed as a pasted link, just skipping the "find Spotify's share button"
// step entirely. Anyone who wants their own specific playlist still has the
// paste option right below.
const QUICK_PICKS: { label: string; url: string }[] = [
  { label: "Lo-Fi Beats", url: "https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn" },
  { label: "Deep Focus", url: "https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ" },
  { label: "Peaceful Piano", url: "https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO" },
  { label: "Jazz Classics", url: "https://open.spotify.com/playlist/37i9dQZF1DXbITWG1ZJKYt" },
  { label: "Chill Hits", url: "https://open.spotify.com/playlist/37i9dQZF1DX4WYpdgoIcn6" },
];

const EDGE_MARGIN = 8;
// Matches the widget's original fixed placement (bottom-32 right-4) so a
// customer who never drags it sees exactly the same spot as before.
const DEFAULT_RIGHT_OFFSET = 16;
const DEFAULT_BOTTOM_OFFSET = 128;

// How close the pointer has to get to a screen edge, while dragging, before
// it counts as "aiming to dock there" - matches the kind of generous grab
// zone Windows Snap uses, since this is meant to be easy to hit without
// needing pixel-perfect aim.
const SNAP_THRESHOLD = 56;

// The app's own header and bottom nav are both fixed-position chrome the
// widget must not cover when docked - these are rough pixel heights (not
// measured live) for how far to inset a docked strip from the true top/
// bottom of the viewport.
const HEADER_H = 56;
const NAV_H = 64;

const FAB_SIZE = 44;
const PANEL_WIDTH = 280;
const SIDEBAR_WIDTH_EXPANDED = 280;
// Kept deliberately thin - a customer on mobile reported the collapsed
// strip still ate a noticeable sliver of the screen at the old 36px/28px.
// The whole strip is still one big tap target (not just the icon), so it
// stays easy to hit even this narrow.
const SIDEBAR_WIDTH_COLLAPSED = 20;
const BAR_HEIGHT_EXPANDED = 96;
const BAR_HEIGHT_COLLAPSED = 16;

function clampPosition(pos: SpotifyWidgetPosition, width: number, height: number): SpotifyWidgetPosition {
  if (typeof window === "undefined") return pos;
  const maxLeft = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN);
  const maxTop = Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN);
  return {
    left: Math.min(Math.max(pos.left, EDGE_MARGIN), maxLeft),
    top: Math.min(Math.max(pos.top, EDGE_MARGIN), maxTop),
  };
}

function defaultPosition(width: number, height: number): SpotifyWidgetPosition {
  if (typeof window === "undefined") return { left: 0, top: 0 };
  return clampPosition(
    {
      left: window.innerWidth - DEFAULT_RIGHT_OFFSET - width,
      top: window.innerHeight - DEFAULT_BOTTOM_OFFSET - height,
    },
    width,
    height
  );
}

// Which edge (if any) the pointer is currently close enough to for a drop
// there to dock the widget - based on the cursor's raw position, not the
// widget's, matching how Windows Snap judges "are you dragging to an edge"
// by where your cursor touches, not where the window's corner lands.
function detectDockZone(clientX: number, clientY: number): DockSide | null {
  if (typeof window === "undefined") return null;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const candidates: [DockSide, number][] = [
    ["left", clientX],
    ["right", w - clientX],
    ["top", clientY],
    ["bottom", h - clientY],
  ];
  candidates.sort((a, b) => a[1] - b[1]);
  const [side, distance] = candidates[0];
  return distance <= SNAP_THRESHOLD ? side : null;
}

// Rough size for the small floating shape shown WHILE dragging - used both
// for the live drag preview and to seed a sensible floating position if the
// drag ends away from any edge. Doesn't need to be pixel-exact: once the
// drag ends, the real floating panel/FAB renders and re-clamps itself
// against its own actual measured size.
function estimateShapeSize(expanded: boolean, needsLinkForm: boolean, embed: SpotifyEmbed | null) {
  if (!expanded) return { width: FAB_SIZE, height: FAB_SIZE };
  const bodyHeight = needsLinkForm || !embed ? 112 : embed.kind === "track" || embed.kind === "episode" ? 152 : 352;
  return { width: PANEL_WIDTH, height: 41 + bodyHeight };
}

interface DragState {
  pos: SpotifyWidgetPosition;
  shape: { width: number; height: number };
  dockZone: DockSide | null;
}

// Unifies mouse + touch dragging for the widget's various handles (the
// closed FAB, the floating panel's title bar, or a docked strip's title
// bar) via the Pointer Events API. Reports raw deltas/cursor position up to
// the caller rather than owning any position state itself, since what a
// drag actually DOES differs by where it started (see startDrag below) -
// this hook only answers "is a drag happening, and where is the pointer."
function useDragHandle(onMove: (dx: number, dy: number, clientX: number, clientY: number) => void, onEnd: (clientX: number, clientY: number, dragged: boolean) => void) {
  const startRef = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY, dragging: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = startRef.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.dragging && Math.hypot(dx, dy) < 6) return;
      s.dragging = true;
      e.preventDefault();
      onMove(dx, dy, e.clientX, e.clientY);
    },
    [onMove]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const s = startRef.current;
      if (s?.dragging) suppressClickRef.current = true;
      onEnd(e.clientX, e.clientY, !!s?.dragging);
      startRef.current = null;
    },
    [onEnd]
  );

  // Swallows the click a browser fires right after a drag's pointerup -
  // without this, dragging the closed FAB (or a docked strip's title bar)
  // even a short distance would also toggle/collapse it, since a click
  // event still follows the same press.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onClickCapture };
}

function collapseIcon(dock: DockSide, collapsed: boolean) {
  const size = 13;
  if (dock === "left") return collapsed ? <ChevronRight size={size} /> : <ChevronLeft size={size} />;
  if (dock === "right") return collapsed ? <ChevronLeft size={size} /> : <ChevronRight size={size} />;
  if (dock === "top") return collapsed ? <ChevronDown size={size} /> : <ChevronUp size={size} />;
  return collapsed ? <ChevronUp size={size} /> : <ChevronDown size={size} />;
}

export default function SpotifyWidget({ suppressed = false }: Props) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState<SpotifyWidgetPosition>({ left: 0, top: 0 });
  const [dock, setDock] = useState<DockSide | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const elementRef = useRef<HTMLDivElement>(null);

  // Read localStorage only after mount (all of this is per-device browser
  // state, not something the server can know) - same guard pattern as
  // ThemeToggle's resolvedTheme() call.
  useEffect(() => {
    setOpen(getSpotifyWidgetOpen());
    setLink(getSpotifyLink());
    setDock(getSpotifyWidgetDock());
    setCollapsed(getSpotifyWidgetCollapsed());
    const saved = getSpotifyWidgetPosition();
    setPos(saved ?? defaultPosition(FAB_SIZE, FAB_SIZE));
    setReady(true);
  }, []);

  const embed: SpotifyEmbed | null = link ? parseSpotifyLink(link) : null;
  // A stored link that no longer parses (e.g. localStorage was hand-edited)
  // falls back to the same empty-state form rather than rendering a broken
  // iframe silently.
  const needsLink = !embed;
  const showForm = needsLink || editing;

  // Re-clamp the floating position against the *actual* rendered size
  // whenever the widget's shape changes (opening from a 44px circle into a
  // ~280px panel, undocking, or the window getting resized/rotated) so a
  // position saved while closed near an edge can't leave the opened panel
  // hanging half off-screen.
  useEffect(() => {
    if (!ready || dock || drag) return;
    const reclamp = () => {
      const rect = elementRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos((p) => {
        const next = clampPosition(p, rect.width, rect.height);
        return next.left === p.left && next.top === p.top ? p : next;
      });
    };
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dock, drag, open, editing, link]);

  // --- Drag lifecycle -----------------------------------------------------
  // A drag can start from three places (the closed FAB, the floating
  // panel's title bar, or a docked strip's title bar) but from that point
  // on behaves identically: a small floating "preview" shape follows the
  // cursor, edges light up when the cursor gets close enough to snap, and
  // release either docks the widget to that edge or drops it as a floating
  // window wherever it was let go. This is why a drag away from a dock
  // immediately turns into the same small floating preview rather than
  // dragging the full-size strip around - a giant sidebar following the
  // cursor would be unwieldy, and "shrink to a small window while moving
  // it" is the same thing Windows does when you drag a snapped window away.
  const wasExpanded = dock ? !collapsed : open;

  const handleDragStart = useCallback(
    (clientX: number, clientY: number) => {
      const shape = estimateShapeSize(wasExpanded, showForm, embed);
      const startPos = dock
        ? clampPosition({ left: clientX - shape.width / 2, top: clientY - shape.height / 2 }, shape.width, shape.height)
        : pos;
      setDrag({ pos: startPos, shape, dockZone: null });
    },
    [dock, pos, wasExpanded, showForm, embed]
  );

  const handleDragMove = useCallback(
    (dx: number, dy: number, clientX: number, clientY: number) => {
      setDrag((d) => {
        // First move past the threshold: seed the drag from wherever it
        // started (see handleDragStart), then every subsequent move is a
        // simple delta from the pointer's own movement.
        const base = d ?? { pos, shape: estimateShapeSize(wasExpanded, showForm, embed), dockZone: null };
        const next = clampPosition({ left: base.pos.left + dx, top: base.pos.top + dy }, base.shape.width, base.shape.height);
        return { pos: next, shape: base.shape, dockZone: detectDockZone(clientX, clientY) };
      });
    },
    [dock, pos, wasExpanded, showForm, embed]
  );

  const handleDragEnd = useCallback(
    (clientX: number, clientY: number, dragged: boolean) => {
      if (!dragged) {
        setDrag(null);
        return;
      }
      const zone = detectDockZone(clientX, clientY);
      if (zone) {
        setDock(zone);
        setSpotifyWidgetDock(zone);
        setCollapsed(false);
        setSpotifyWidgetCollapsed(false);
      } else {
        const shape = estimateShapeSize(wasExpanded, showForm, embed);
        const finalPos = clampPosition(
          { left: clientX - shape.width / 2, top: clientY - shape.height / 2 },
          shape.width,
          shape.height
        );
        setPos(finalPos);
        setSpotifyWidgetPosition(finalPos);
        if (dock) {
          setDock(null);
          setSpotifyWidgetDock(null);
        }
      }
      setDrag(null);
    },
    [dock, wasExpanded, showForm, embed]
  );

  // Seed the drag on the very first move past the threshold, then let
  // handleDragMove's own functional update take over for every move after.
  const seededRef = useRef(false);
  const onFirstMoveSeed = useCallback(
    (dx: number, dy: number, clientX: number, clientY: number) => {
      if (!seededRef.current) {
        seededRef.current = true;
        handleDragStart(clientX, clientY);
      }
      handleDragMove(dx, dy, clientX, clientY);
    },
    [handleDragStart, handleDragMove]
  );

  const onEndAndReset = useCallback(
    (clientX: number, clientY: number, dragged: boolean) => {
      seededRef.current = false;
      handleDragEnd(clientX, clientY, dragged);
    },
    [handleDragEnd]
  );

  const dragHandle = useDragHandle(onFirstMoveSeed, onEndAndReset);

  if (suppressed || !ready) return null;

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    setSpotifyWidgetOpen(next);
    if (next && needsLink) setEditing(true);
  };

  const close = () => {
    setOpen(false);
    setSpotifyWidgetOpen(false);
    setEditing(false);
    if (dock) {
      setDock(null);
      setSpotifyWidgetDock(null);
    }
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    setSpotifyWidgetCollapsed(next);
    if (next && needsLink) setEditing(false);
  };

  const saveDraft = () => {
    const parsed = parseSpotifyLink(draft);
    if (!parsed) {
      setError("That doesn't look like a Spotify link. Try “Copy link to playlist/track/album” from Spotify.");
      return;
    }
    setSpotifyLink(draft.trim());
    setLink(draft.trim());
    setError(null);
    setDraft("");
    setEditing(false);
  };

  const removeLink = () => {
    setSpotifyLink(null);
    setLink(null);
    setEditing(true);
  };

  // Same effect as saveDraft, but for a pre-vetted quick-pick URL - skips
  // the parse-and-validate step since QUICK_PICKS is a fixed, known-good
  // list rather than customer-typed text.
  const chooseQuickPick = (url: string) => {
    setSpotifyLink(url);
    setLink(url);
    setError(null);
    setDraft("");
    setEditing(false);
  };

  const embedHeight = (compact: boolean) => {
    if (!embed) return 0;
    if (compact) return 80;
    return embed.kind === "track" || embed.kind === "episode" ? 152 : 352;
  };

  // A previous version of this pointed customers at the Spotify logo in
  // the embed's corner as a "log in for full songs" tip. Turned out that
  // icon deep-links out to the native Spotify app on mobile rather than
  // logging in inline - exactly the app-switching (and the background-tab
  // reload risk that comes with it, mid-inventory-count) this widget is
  // meant to avoid. A real fix would be Spotify's own Web Playback SDK
  // (true in-page Premium streaming, no app hop), but that needs Spotify's
  // written approval for commercial use and is capped at 5 authorized
  // users without it - not workable for real customers. So: no hint, no
  // nudge toward that icon. Previews-only-in-the-browser is the tradeoff
  // that keeps this 100% app-switch-free by default.

  // A translucent highlight along whichever edge the cursor is currently
  // close enough to for a drop to dock there - the same visual language as
  // Windows Snap's preview outline, so it's obvious before releasing
  // exactly what letting go right now will do.
  const snapPreview = drag?.dockZone && (
    <div
      className="pointer-events-none fixed z-50 border-2 border-dashed border-brand bg-brand/10 transition-opacity"
      style={
        drag.dockZone === "left"
          ? { left: 0, top: HEADER_H, bottom: NAV_H, width: SIDEBAR_WIDTH_EXPANDED }
          : drag.dockZone === "right"
            ? { right: 0, top: HEADER_H, bottom: NAV_H, width: SIDEBAR_WIDTH_EXPANDED }
            : drag.dockZone === "top"
              ? { left: 0, right: 0, top: HEADER_H, height: BAR_HEIGHT_EXPANDED }
              : { left: 0, right: 0, bottom: NAV_H, height: BAR_HEIGHT_EXPANDED }
      }
    />
  );

  const controlButtons = (showCollapse: DockSide | null) => (
    <div className="flex items-center gap-1">
      {!needsLink && !editing && (
        <button
          onClick={() => {
            setDraft(link ?? "");
            setEditing(true);
          }}
          aria-label="Change music link"
          className="rounded-lg p-1 text-neutral-400 hover:bg-surface-muted hover:text-neutral-700"
        >
          <Pencil size={14} />
        </button>
      )}
      {!needsLink && !editing && (
        <button
          onClick={removeLink}
          aria-label="Remove music link"
          className="rounded-lg p-1 text-neutral-400 hover:bg-surface-muted hover:text-neutral-700"
        >
          <Trash2 size={14} />
        </button>
      )}
      {showCollapse && (
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand music widget" : "Collapse music widget"}
          className="rounded-lg p-1 text-neutral-400 hover:bg-surface-muted hover:text-neutral-700"
        >
          {collapseIcon(showCollapse, collapsed)}
        </button>
      )}
      <button
        onClick={close}
        aria-label="Close music widget"
        className="rounded-lg p-1 text-neutral-400 hover:bg-surface-muted hover:text-neutral-700"
      >
        <X size={16} />
      </button>
    </div>
  );

  const linkForm = (horizontal: boolean) => (
    <div className={horizontal ? "flex flex-1 items-center gap-2 px-3 py-2" : "space-y-2 p-3"}>
      {!horizontal && (
        <>
          <p className="text-[11px] text-neutral-500">
            Tap one to start playing right away, or paste your own Spotify playlist, album, track, or podcast link
            below.
          </p>
          {/* Bypasses Spotify's own share-link flow entirely (buried in a
              submenu on desktop, easy to never find in the mobile app) -
              see QUICK_PICKS above for why these specific playlists. */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PICKS.map((pick) => (
              <button
                key={pick.url}
                onClick={() => chooseQuickPick(pick.url)}
                className="rounded-full border border-surface-border px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:border-[#1DB954] hover:text-[#1DB954]"
              >
                {pick.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-neutral-400">Or paste your own link:</p>
        </>
      )}
      <input
        type="text"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        placeholder="https://open.spotify.com/playlist/…"
        className={
          horizontal
            ? "min-w-0 flex-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
            : "w-full rounded-lg border border-surface-border px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
        }
      />
      {!horizontal && error && <p className="text-[11px] text-accent-low">{error}</p>}
      <div className={horizontal ? "flex shrink-0 items-center gap-2" : "flex justify-end gap-2"}>
        {!needsLink && (
          <button
            onClick={() => {
              setEditing(false);
              setDraft("");
              setError(null);
            }}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-neutral-500 hover:bg-surface-muted"
          >
            Cancel
          </button>
        )}
        <button
          onClick={saveDraft}
          className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
        >
          Save
        </button>
      </div>
    </div>
  );

  // --- Actively dragging: small floating preview shape --------------------
  if (drag) {
    const style = { left: drag.pos.left, top: drag.pos.top, touchAction: "none" as const };
    return (
      <>
        {snapPreview}
        {wasExpanded ? (
          <div
            className="fixed z-50 w-[280px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl2 border border-surface-border bg-white opacity-90 shadow-card"
            style={style}
          >
            <div className="flex items-center gap-1.5 border-b border-surface-border px-3 py-2 text-xs font-semibold text-neutral-700">
              <GripHorizontal size={13} className="text-neutral-400" aria-hidden />
              <Music2 size={14} className="text-[#1DB954]" />
              Music
            </div>
          </div>
        ) : (
          <div
            className="fixed z-50 flex h-11 w-11 items-center justify-center rounded-full border border-surface-border bg-white text-[#1DB954] opacity-90 shadow-card"
            style={style}
          >
            <Music2 size={20} />
          </div>
        )}
        {/* Invisible full-viewport capture layer so the drag keeps tracking
            the pointer no matter what's underneath it (iframe, other
            buttons, etc). setPointerCapture on the handle already does
            this for the pointer that started the drag, but this also stops
            hover/click states on page content from flickering mid-drag. */}
        <div
          className="fixed inset-0 z-40"
          style={{ touchAction: "none" }}
          onPointerMove={dragHandle.onPointerMove}
          onPointerUp={dragHandle.onPointerUp}
        />
      </>
    );
  }

  // --- Docked: collapsible sidebar (left/right) or bar (top/bottom) -------
  if (dock) {
    const vertical = dock === "left" || dock === "right";
    // Two separate styles rather than one that swaps a size - the panel
    // below always stays at its EXPANDED size/position (see the comment on
    // it for why) and only the collapsed tab uses the collapsed one.
    const expandedStyle: React.CSSProperties = vertical
      ? { [dock]: 0, top: HEADER_H, bottom: NAV_H, width: SIDEBAR_WIDTH_EXPANDED }
      : {
          left: 0,
          right: 0,
          // Inset from the true viewport edge by the app's own header/nav
          // height - a top bar flush at 0 would sit on top of (and hide)
          // the app's sticky header, and a bottom bar flush at 0 would hide
          // the fixed BottomNav.
          ...(dock === "top" ? { top: HEADER_H } : { bottom: NAV_H }),
          height: BAR_HEIGHT_EXPANDED,
        };
    const collapsedTabStyle: React.CSSProperties = vertical
      ? { [dock]: 0, top: HEADER_H, bottom: NAV_H, width: SIDEBAR_WIDTH_COLLAPSED }
      : {
          left: 0,
          right: 0,
          ...(dock === "top" ? { top: HEADER_H } : { bottom: NAV_H }),
          height: BAR_HEIGHT_COLLAPSED,
        };

    return (
      <>
        {/* Kept mounted at its normal expanded size/position even while
            collapsed - only visually hidden (CSS visibility, not display or
            unmounting) and non-interactive, so whatever's playing in the
            iframe below keeps playing. Collapsing used to literally remove
            this whole panel (iframe included) from the page, which killed
            playback outright - a customer caught that regression. */}
        <div
          ref={elementRef}
          className={`fixed z-40 flex overflow-hidden border-surface-border bg-white shadow-card ${
            vertical ? "flex-col border-l border-r" : "flex-col border-t border-b"
          } ${collapsed ? "invisible pointer-events-none" : ""}`}
          style={expandedStyle}
          aria-hidden={collapsed}
        >
          <div className={`flex items-center justify-between border-b border-surface-border ${vertical ? "px-3 py-2" : "px-3 py-1.5"}`}>
            {/* Only the title/grip area is the drag handle - deliberately NOT
                the whole header row, so grabbing near the pencil/trash/
                collapse/close icons to start a drag can't also register as a
                press on one of them. */}
            <div
              onPointerDown={dragHandle.onPointerDown}
              onPointerMove={dragHandle.onPointerMove}
              onPointerUp={dragHandle.onPointerUp}
              className="flex cursor-grab select-none items-center gap-1.5 py-1 pr-2 text-xs font-semibold text-neutral-700 active:cursor-grabbing"
              style={{ touchAction: "none" }}
              title="Drag to move or undock"
            >
              <GripHorizontal size={13} className="text-neutral-400" aria-hidden />
              <Music2 size={14} className="text-[#1DB954]" />
              {vertical && "Music"}
            </div>
            {controlButtons(dock)}
          </div>

          {vertical ? (
            showForm ? (
              linkForm(false)
            ) : (
              embed && (
                <div className="min-h-0 flex-1">
                  <iframe
                    key={embed.embedUrl}
                    src={embed.embedUrl}
                    width="100%"
                    height="100%"
                    style={{ border: 0, display: "block" }}
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    title="Spotify player"
                  />
                </div>
              )
            )
          ) : showForm ? (
            linkForm(true)
          ) : (
            embed && (
              <iframe
                key={embed.embedUrl}
                src={embed.embedUrl}
                width="100%"
                height={embedHeight(true)}
                style={{ border: 0, display: "block" }}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                title="Spotify player"
              />
            )
          )}
        </div>

        {collapsed && (
          <Tooltip label="Expand music widget" side={dock === "top" ? "bottom" : "top"}>
            <button
              onClick={toggleCollapsed}
              aria-label="Expand music widget"
              className={`fixed z-40 flex items-center justify-center border border-surface-border bg-white text-[#1DB954] shadow-card hover:opacity-90 ${
                vertical ? "flex-col rounded-r-lg rounded-l-none" : "rounded-b-lg rounded-t-none"
              }`}
              style={collapsedTabStyle}
            >
              <Music2 size={13} />
            </button>
          </Tooltip>
        )}
      </>
    );
  }

  // --- Floating: closed FAB -------------------------------------------------
  const style = { left: pos.left, top: pos.top, touchAction: "none" as const };

  if (!open) {
    return (
      <div ref={elementRef} className="fixed z-40" style={style}>
        <Tooltip label="Open music widget (drag to move or dock)" side="top">
          <button
            onPointerDown={dragHandle.onPointerDown}
            onPointerMove={dragHandle.onPointerMove}
            onPointerUp={dragHandle.onPointerUp}
            onClickCapture={dragHandle.onClickCapture}
            onClick={toggleOpen}
            aria-label="Open music widget"
            className="flex h-11 w-11 cursor-grab items-center justify-center rounded-full border border-surface-border bg-white text-[#1DB954] shadow-card active:cursor-grabbing hover:opacity-90"
          >
            <Music2 size={20} />
          </button>
        </Tooltip>
      </div>
    );
  }

  // --- Floating: open panel -------------------------------------------------
  return (
    <div
      ref={elementRef}
      className="fixed z-40 w-[280px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl2 border border-surface-border bg-white shadow-card"
      style={style}
    >
      <div className="flex items-center justify-between border-b border-surface-border px-3 py-2">
        <div
          onPointerDown={dragHandle.onPointerDown}
          onPointerMove={dragHandle.onPointerMove}
          onPointerUp={dragHandle.onPointerUp}
          className="flex cursor-grab select-none items-center gap-1.5 py-1 pr-2 text-xs font-semibold text-neutral-700 active:cursor-grabbing"
          style={{ touchAction: "none" }}
          title="Drag to move or dock to an edge"
        >
          <GripHorizontal size={13} className="text-neutral-400" aria-hidden />
          <Music2 size={14} className="text-[#1DB954]" />
          Music
        </div>
        {controlButtons(null)}
      </div>

      {showForm
        ? linkForm(false)
        : embed && (
            <iframe
              key={embed.embedUrl}
              src={embed.embedUrl}
              width="100%"
              height={embedHeight(false)}
              style={{ border: 0, display: "block" }}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              title="Spotify player"
            />
          )}
    </div>
  );
}
