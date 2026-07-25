import { InventoryItem } from "./types";

// Composite key for "the same inventory row" once a barcode can legitimately
// appear on more than one row — see the Phase 4 per-location quantity
// feature (same barcode, different `location`, e.g. milk in the walk-in
// fridge vs. milk in the front fridge). Location is normalized (trimmed,
// case-insensitive) so "Freezer" and "freezer " land on the same row.
// Callers only reach for this once they've already established the barcode
// alone is ambiguous (see isAmbiguousBarcode below) — using it unconditionally
// would break the common single-location case, where a customer relocating
// an item (editing its Location field, or editing the cell directly in
// their Google Sheet) should still merge into the same row, not spawn a
// second one just because the location text changed.
export function itemMergeKey(barcode: string, location?: string): string {
  return `${barcode.trim()}::${(location || "").trim().toLowerCase()}`;
}

// Every row in `items` that shares `barcode` with `item` (its "location
// siblings" — same product, tracked separately per location). Excludes
// `item` itself. Empty barcodes never group — see itemMergeKey above; a
// barcode-less item never has siblings.
export function locationSiblings(
  item: Pick<InventoryItem, "id" | "barcode">,
  items: InventoryItem[]
): InventoryItem[] {
  if (!item.barcode) return [];
  return items.filter((it) => it.id !== item.id && it.barcode === item.barcode);
}

// Barcode -> how many rows in `items` currently use it. Used to decide
// whether a barcode is still unambiguous (0 or 1 row — match/merge by
// barcode alone, same as before Phase 4) or needs location as a
// tie-breaker (2+ rows — see itemMergeKey).
export function countByBarcode(items: Pick<InventoryItem, "barcode">[]): Map<string, number> {
  const counts = new Map<string, number>();
  items.forEach((it) => {
    const bc = it.barcode.trim();
    if (!bc) return;
    counts.set(bc, (counts.get(bc) ?? 0) + 1);
  });
  return counts;
}
