import { InventoryItem } from "./types";
import { getEditorName } from "./storage";

// How recent counts as "recent" for the "someone just changed this"
// overwrite warning below.
export const RECENT_EDIT_WINDOW_MS = 5 * 60 * 1000;

// Whether `item` was last touched, within the window above, by a named
// editor who isn't whoever's using this device right now — see ItemCard's
// stock controls and ItemEditModal's Save button, the two places this
// gates.
//
// This is the deliberately lightweight version described in the feature
// plan: it only ever compares against what THIS device's own copy of the
// item already knows. If another device edits the same item and this
// device hasn't pulled that change yet, this device's local copy still
// shows the old timestamp/editor and this returns false — there's no way
// to catch a collision this device doesn't know about without a live
// shared backend, which is a materially bigger rebuild than this feature
// on its own. Pairing this with a habit of pulling before a shift (or
// tightening the existing background "someone updated this sheet" poll)
// narrows that gap without needing one.
//
// Silent (never warns) for any item that's never had an editor name
// attributed to it — there's no separate `createdAt` field to otherwise
// tell "I just added this a moment ago" apart from "someone touched this
// moments ago," so requiring a real, *different* name is what keeps a
// customer from being warned about their own just-now edit.
export function isRecentOtherEdit(item: Pick<InventoryItem, "updatedAt" | "lastEditedBy">): boolean {
  if (!item.lastEditedBy) return false;
  if (item.lastEditedBy === getEditorName()) return false;
  const editedMs = new Date(item.updatedAt).getTime();
  if (!Number.isFinite(editedMs)) return false;
  return Date.now() - editedMs < RECENT_EDIT_WINDOW_MS;
}
