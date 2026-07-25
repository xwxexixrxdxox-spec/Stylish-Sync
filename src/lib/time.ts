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
