"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Music2, X, Pencil, Trash2, GripHorizontal } from "lucide-react";
import {
  getSpotifyLink,
  setSpotifyLink,
  getSpotifyWidgetOpen,
  setSpotifyWidgetOpen,
  parseSpotifyLink,
  getSpotifyWidgetPosition,
  setSpotifyWidgetPosition,
  type SpotifyEmbed,
  type SpotifyWidgetPosition,
} from "@/lib/spotifyWidget";
import Tooltip from "./Tooltip";

// Optional "background music" widget, entirely opt-in and per-device (see
// spotifyWidget.ts for the storage/parsing rationale). Draggable anywhere
// on screen (see useDraggable below) - it started out pinned to a fixed
// bottom-right spot, but that turned out to sit right on top of each
// inventory row's edit/delete buttons and the Support tab's suggestion
// chips depending on scroll position, so it needed to be movable out of the
// way rather than just repositioned to a different fixed spot that would
// eventually collide with something else too. Closed by default so a
// brand-new visitor sees nothing and nothing third-party ever loads until
// they deliberately open this and paste a link themselves.
//
// Mirrors InstallBanner's `suppressed` pattern: hidden (not unmounted state-
// wise, just not rendered) while the onboarding tour has the screen's
// attention, so it can't overlap the tutorial spotlight/callout.
interface Props {
  suppressed?: boolean;
}

const EDGE_MARGIN = 8;
// Matches the widget's original fixed placement (bottom-32 right-4) so a
// customer who never drags it sees exactly the same spot as before.
const DEFAULT_RIGHT_OFFSET = 16;
const DEFAULT_BOTTOM_OFFSET = 128;

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

// Unifies mouse + touch dragging for a fixed-position element via the
// Pointer Events API, and tells the difference between "dragged" and
// "tapped" (a plain tap/click on the FAB still has to toggle it open) by
// only counting it as a drag once the pointer has moved a few pixels.
// Position is persisted to localStorage only once the drag ends, not on
// every move, so it isn't hammering localStorage 60 times a second.
function useDraggable(elementRef: React.RefObject<HTMLElement>, pos: SpotifyWidgetPosition, setPos: (p: SpotifyWidgetPosition) => void) {
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number; dragging: boolean } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  // Set right before pointerup ends a real drag, so the FAB's onClick
  // (which fires right after) knows to skip toggling open/closed.
  const suppressNextClickRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: posRef.current.left,
      startTop: posRef.current.top,
      dragging: false,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.dragging && Math.hypot(dx, dy) < 6) return;
      drag.dragging = true;
      e.preventDefault();
      const rect = elementRef.current?.getBoundingClientRect();
      const next = clampPosition(
        { left: drag.startLeft + dx, top: drag.startTop + dy },
        rect?.width ?? 44,
        rect?.height ?? 44
      );
      posRef.current = next;
      setPos(next);
    },
    [elementRef, setPos]
  );

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.dragging) {
      suppressNextClickRef.current = true;
      setSpotifyWidgetPosition(posRef.current);
    }
    dragRef.current = null;
  }, []);

  // Swallows the click a browser fires right after a drag's pointerup -
  // without this, dragging the closed FAB even a short distance would also
  // toggle it open, since a click event still follows the same press.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onClickCapture };
}

export default function SpotifyWidget({ suppressed = false }: Props) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState<SpotifyWidgetPosition>({ left: 0, top: 0 });
  const elementRef = useRef<HTMLDivElement>(null);

  // Read localStorage only after mount (both are per-device browser state,
  // not something the server can know) - same guard pattern as
  // ThemeToggle's resolvedTheme() call.
  useEffect(() => {
    setOpen(getSpotifyWidgetOpen());
    setLink(getSpotifyLink());
    const saved = getSpotifyWidgetPosition();
    setPos(saved ?? defaultPosition(44, 44));
    setReady(true);
  }, []);

  const drag = useDraggable(elementRef, pos, setPos);

  // Re-clamp against the *actual* rendered size whenever the widget's shape
  // changes (opening from a 44px circle into a ~280px panel, or the window
  // getting resized/rotated) so a position saved while closed near an edge
  // can't leave the opened panel hanging half off-screen.
  useEffect(() => {
    if (!ready) return;
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
  }, [ready, open, editing, link]);

  if (suppressed || !ready) return null;

  const embed: SpotifyEmbed | null = link ? parseSpotifyLink(link) : null;
  // A stored link that no longer parses (e.g. localStorage was hand-edited)
  // falls back to the same empty-state form rather than rendering a broken
  // iframe silently.
  const needsLink = !embed;

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

  const style = { left: pos.left, top: pos.top, touchAction: "none" as const };

  if (!open) {
    return (
      <div ref={elementRef} className="fixed z-40" style={style}>
        <Tooltip label="Open music widget (drag to move)" side="top">
          <button
            onPointerDown={drag.onPointerDown}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerUp}
            onClickCapture={drag.onClickCapture}
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

  const embedHeight = embed && (embed.kind === "track" || embed.kind === "episode") ? 152 : 352;

  return (
    <div
      ref={elementRef}
      className="fixed z-40 w-[280px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl2 border border-surface-border bg-white shadow-card"
      style={style}
    >
      <div className="flex items-center justify-between border-b border-surface-border px-3 py-2">
        {/* Only the title/grip area is the drag handle - deliberately NOT
            the whole header row, so grabbing near the pencil/trash/close
            icons to start a drag can't also register as a press on one of
            them (there's no click-suppression wired up for those buttons
            individually, so a drag starting on, say, the trash icon would
            otherwise both move the widget and delete the link). */}
        <div
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          className="flex cursor-grab select-none items-center gap-1.5 py-1 pr-2 text-xs font-semibold text-neutral-700 active:cursor-grabbing"
          style={{ touchAction: "none" }}
          title="Drag to move"
        >
          <GripHorizontal size={13} className="text-neutral-400" aria-hidden />
          <Music2 size={14} className="text-[#1DB954]" />
          Music
        </div>
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
          <button
            onClick={close}
            aria-label="Close music widget"
            className="rounded-lg p-1 text-neutral-400 hover:bg-surface-muted hover:text-neutral-700"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {needsLink || editing ? (
        <div className="space-y-2 p-3">
          <p className="text-[11px] text-neutral-500">
            Paste a Spotify playlist, album, track, or podcast link to play it here while you work.
          </p>
          <input
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            placeholder="https://open.spotify.com/playlist/…"
            className="w-full rounded-lg border border-surface-border px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
          />
          {error && <p className="text-[11px] text-accent-low">{error}</p>}
          <div className="flex justify-end gap-2">
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
      ) : (
        embed && (
          <iframe
            key={embed.embedUrl}
            src={embed.embedUrl}
            width="100%"
            height={embedHeight}
            style={{ border: 0, display: "block" }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title="Spotify player"
          />
        )
      )}
    </div>
  );
}
