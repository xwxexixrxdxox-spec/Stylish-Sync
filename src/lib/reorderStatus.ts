import { InventoryItem } from "./types";

// Ties a break-down "parent" item's reorder status to whatever's already
// sitting in its broken-down child item, so breaking down a couple of cases
// doesn't make the case itself look artificially low on stock the moment
// its own quantity dips.
//
// Example: 3 cases of a 40-pack, 2 broken down into 80 loose bottles — the
// case item's own quantity drops to 1, which alone might already sit at or
// under its reorder point. But there's really 1 case + 80/40 = 3
// case-equivalents of supply on the shelf between the two linked items, and
// that intact case is effectively a buffer, not a shortage. This only
// adjusts the parent (case) side of the relationship — the child/loose item
// keeps its own reorder point exactly as set (e.g. "reorder once we're down
// to 20% of a broken-down batch"), since that's the number a customer is
// usually actually watching day to day, and folding the parent's whole
// cases into it would only make it LESS sensitive, the opposite of useful.
export function getEffectiveQuantity(item: InventoryItem, items: InventoryItem[]): number {
  if (!item.breaksDownIntoBarcode || !item.breaksDownIntoQty || item.breaksDownIntoQty <= 0) {
    return item.quantity;
  }
  const child = items.find((it) => it.barcode === item.breaksDownIntoBarcode);
  if (!child) return item.quantity;
  return item.quantity + child.quantity / item.breaksDownIntoQty;
}

export function isLowStock(item: InventoryItem, items: InventoryItem[]): boolean {
  return getEffectiveQuantity(item, items) <= item.reorderAt;
}

// Positive = that far over the reorder point, zero/negative = due. Used for
// "biggest deficit first" ranking (Inventory tab's "Low stock first" sort,
// the push digest) so items are ordered by real urgency rather than just
// their own raw quantity.
export function stockDeficit(item: InventoryItem, items: InventoryItem[]): number {
  return item.reorderAt - getEffectiveQuantity(item, items);
}
