import { InventoryItem } from "./types";

// Storage locations (e.g. "Dry Stock", "Freezer", "Back Room") aren't a
// fixed list anywhere - they're whatever the customer has typed in on their
// own items so far. Deriving the suggestion list straight from the current
// inventory (rather than keeping a separate persisted list of locations)
// means there's exactly one source of truth: a location "exists" precisely
// when at least one item currently uses it, and there's no separate list to
// fall out of sync or need its own cleanup when items are deleted or edited.
export function getKnownLocations(items: InventoryItem[]): string[] {
  const set = new Set<string>();
  items.forEach((it) => {
    const loc = (it.location || "").trim();
    if (loc) set.add(loc);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
