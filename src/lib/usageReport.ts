import { InventoryItem, StockMovement } from "./types";

// Shared shape for "usage as a spreadsheet row" — used by three surfaces:
// the xlsx/CSV export's Usage sheet, the Google Sheets sync's Usage tab,
// and the customer-importable usage-history template. Defining it once
// here means an export can be edited and re-imported without a format
// mismatch, and the three surfaces can't quietly drift apart from each
// other.
export const USAGE_COLUMNS = ["Barcode", "Item Name", "Date", "Quantity Used", "Type", "Note"];

const REASON_LABEL: Record<StockMovement["reason"], string> = {
  "scan-add": "Restock (scan)",
  "scan-remove": "Usage (scan)",
  "manual-adjust": "Manual adjustment",
  import: "Inventory import",
  "usage-import": "Imported usage history",
};

export interface UsageRow {
  barcode: string;
  itemName: string;
  date: string; // YYYY-MM-DD
  quantityUsed: number; // always positive — "how much was used," not a signed delta
  type: string;
  note: string;
}

// Converts logged usage (negative-delta movements — restocks are excluded,
// this is a usage report, not a full ledger) into the shared row shape.
// Movements for items that have since been deleted are still included
// (labeled "(deleted item)") rather than silently dropped, since the
// historical usage still happened and a customer reconciling totals would
// otherwise wonder where it went.
export function movementsToUsageRows(movements: StockMovement[], items: InventoryItem[]): UsageRow[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  return movements
    .filter((m) => m.delta < 0)
    .map((m) => {
      const item = byId.get(m.itemId);
      return {
        barcode: item?.barcode ?? "",
        itemName: item?.name ?? "(deleted item)",
        date: m.at.slice(0, 10),
        quantityUsed: Math.abs(m.delta),
        type: REASON_LABEL[m.reason] ?? m.reason,
        note: "",
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function startOfWeekSunday(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  const y = copy.getFullYear();
  const m = String(copy.getMonth() + 1).padStart(2, "0");
  const day = String(copy.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface WeeklyTotal {
  weekStart: string; // YYYY-MM-DD, always a Sunday
  total: number;
}

// Combined-across-all-items weekly usage totals — the data source behind
// both the xlsx/CSV text-bar summary and the Google Sheets native chart.
// Fixed weekly buckets (rather than the in-app Usage tab's adaptive
// day/week/month granularity) because an export is a static snapshot
// covering an unknown, possibly multi-year span, and weekly stays readable
// at any length without needing to pick a granularity per export.
export function weeklyUsageTotals(movements: StockMovement[]): WeeklyTotal[] {
  const totals = new Map<string, number>();
  movements
    .filter((m) => m.delta < 0)
    .forEach((m) => {
      const key = startOfWeekSunday(new Date(m.at));
      totals.set(key, (totals.get(key) ?? 0) + Math.abs(m.delta));
    });
  return Array.from(totals.entries())
    .map(([weekStart, total]) => ({ weekStart, total }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}
