"use client";

import { useEffect, useState } from "react";
import { Music2, X, Pencil, Trash2 } from "lucide-react";
import {
  getSpotifyLink,
  setSpotifyLink,
  getSpotifyWidgetOpen,
  setSpotifyWidgetOpen,
  parseSpotifyLink,
  type SpotifyEmbed,
} from "@/lib/spotifyWidget";
import Tooltip from "./Tooltip";

// Optional "background music" widget, entirely opt-in and per-device (see
// spotifyWidget.ts for the storage/parsing rationale). Sits low on the
// right edge of the screen, above the bottom nav - closed by default so a
// brand-new visitor sees nothing and nothing third-party ever loads until
// they deliberately open this and paste a link themselves.
//
// Mirrors InstallBanner's `suppressed` pattern: hidden (not unmounted state-
// wise, just not rendered) while the onboarding tour has the screen's
// attention, so it can't overlap the tutorial spotlight/callout.
interface Props {
  suppressed?: boolean;
}

export default function SpotifyWidget({ suppressed = false }: Props) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Read localStorage only after mount (both are per-device browser state,
  // not something the server can know) - same guard pattern as
  // ThemeToggle's resolvedTheme() call.
  useEffect(() => {
    setOpen(getSpotifyWidgetOpen());
    setLink(getSpotifyLink());
  }, []);

  if (suppressed) return null;

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

  if (!open) {
    return (
      <div className="fixed bottom-32 right-4 z-40">
        <Tooltip label="Open music widget" side="top">
          <button
            onClick={toggleOpen}
            aria-label="Open music widget"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-surface-border bg-white text-[#1DB954] shadow-card hover:opacity-90"
          >
            <Music2 size={20} />
          </button>
        </Tooltip>
      </div>
    );
  }

  const embedHeight = embed && (embed.kind === "track" || embed.kind === "episode") ? 152 : 352;

  return (
    <div className="fixed bottom-32 right-4 z-40 w-[280px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl2 border border-surface-border bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-surface-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700">
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
