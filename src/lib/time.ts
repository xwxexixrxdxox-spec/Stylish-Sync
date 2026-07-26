// Coarse "how long ago" for a UI timestamp — doesn't need second-level
// precision, just enough for someone to eyeball "just now" vs "3 hours
// ago." Originally lived only inside AccountTab.tsx (for the "Last synced"
// line); pulled out here once ItemCard's "edited by" line and the
// recent-edit overwrite confirmation needed the exact same formatting, so
// all three stay in sync rather than drifting into slightly different
// wordings.
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Absolute, human-readable timestamp for a cell in an exported/pushed
// sheet (the "Last Edited At" column) — unlike formatRelativeTime above,
// this needs to stay meaningful long after the moment it was written, so
// "3h ago" won't do. Deliberately local-time ISO 8601 *without* a "Z"/
// offset suffix ("2026-07-26T14:32"): readable at a glance, sorts
// correctly as plain text, and — per the ECMA-262 Date Time String
// Format — a date-time string with no offset parses back as local time,
// so `new Date(...)` round-trips this exactly on the same device without
// needing a matching parser of our own.
export function formatSheetTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
