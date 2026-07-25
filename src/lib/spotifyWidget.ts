"use client";

// A small, self-contained, opt-in "background music" widget - see
// SpotifyWidget.tsx. Kept separate from storage.ts (rather than folded in)
// since the URL-parsing logic here isn't storage at all, and this is the
// one place in the app that embeds third-party content by design (see the
// Privacy Policy's "Third parties we rely on" section).
//
// Deliberately per-device, not synced anywhere: this is a client-only
// localStorage value, same as every other display preference in this app
// (theme, inventory sort order, etc.) - there's no account system to hang
// a "your" playlist off of, and one shared visible widget with no login
// wouldn't have anywhere safe to keep a personal setting anyway. Whoever
// sets it up on a given device/browser is choosing what plays there.

const LINK_KEY = "isc_spotify_link_v1";
const OPEN_KEY = "isc_spotify_widget_open_v1";

export type SpotifyEmbedKind = "playlist" | "album" | "track" | "artist" | "show" | "episode";

export interface SpotifyEmbed {
  kind: SpotifyEmbedKind;
  id: string;
  embedUrl: string;
}

// Matches any spotify.com share link a customer might paste - the normal
// "Copy link to X" action in the Spotify app produces
// https://open.spotify.com/playlist/<id>?si=... (or album/track/artist/
// show/episode instead of playlist). The ?si= tracking param and anything
// else after the id is intentionally ignored - only the type+id ever gets
// used to build the embed URL below, so nothing about what a customer
// pastes ever reaches the page as-is (see parseSpotifyLink).
const SPOTIFY_LINK_PATTERN =
  /open\.spotify\.com\/(playlist|album|track|artist|show|episode)\/([a-zA-Z0-9]+)/;

// Never trusts the pasted URL directly as an iframe src - only ever
// extracts a type and an alphanumeric id via the pattern above and
// rebuilds a fresh, known-shape open.spotify.com/embed/... URL from those
// two pieces. A link that doesn't match returns null and nothing gets
// rendered, rather than falling back to embedding whatever was typed.
export function parseSpotifyLink(raw: string): SpotifyEmbed | null {
  const match = raw.trim().match(SPOTIFY_LINK_PATTERN);
  if (!match) return null;
  const kind = match[1] as SpotifyEmbedKind;
  const id = match[2];
  return { kind, id, embedUrl: `https://open.spotify.com/embed/${kind}/${id}?theme=0` };
}

export function getSpotifyLink(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LINK_KEY);
}

export function setSpotifyLink(raw: string | null): void {
  if (typeof window === "undefined") return;
  if (raw) window.localStorage.setItem(LINK_KEY, raw);
  else window.localStorage.removeItem(LINK_KEY);
}

export function getSpotifyWidgetOpen(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(OPEN_KEY) === "1";
}

export function setSpotifyWidgetOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  if (open) window.localStorage.setItem(OPEN_KEY, "1");
  else window.localStorage.removeItem(OPEN_KEY);
}
