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
  "break-case": "Broke down case",
};

// Reverse of REASON_LABEL — used when reading usage rows back out of a
// Google Sheet (see reconcileUsageFromSheetRows below) to recover the
// original reason for a row that's new-to-this-device but already had a
// recognizable Type label written by another device's push. Falls back to
// "usage-import" for anything that doesn't match (a label the customer
// edited by hand, or a row from before this labeling existed).
const REASON_FROM_LABEL: Record<string, StockMovement["reason"]> = Object.fromEntries(
  Object.entries(REASON_LABEL).map(([reason, label]) => [label, reason as StockMovement["reason"]])
);

export interface UsageRow {
  id: string; // the source StockMovement's id — stable across pushes, used as the Sync ID column in Google Sheets so a pull can reconcile edits back to the exact movement they came from
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
        id: m.id,
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

// The shape a Usage row comes back as when read from the Google Sheet
// (see googleSheets.ts's pullUsageFromSheet) — same columns as UsageRow
// above, plus the raw Sync ID text exactly as found in the sheet (empty
// string, not undefined, for a row with no id yet).
export interface UsageSheetRow {
  barcode: string;
  itemName: string;
  date: string;
  quantityUsed: number;
  type: string;
  note: string;
  syncId: string;
}

export interface UsageReconcileResult {
  // The full movement list to persist (replaces whatever was loaded —
  // untouched non-usage movements pass through unchanged, see below).
  movements: StockMovement[];
  // The Sync IDs now present in the sheet — becomes the new "previously
  // synced" set for next time, so a future pull can tell "removed from
  // the sheet" apart from "never synced in the first place."
  syncedIds: string[];
  added: number;
  updated: number;
  deleted: number;
  unmatchedBarcodes: string[];
  skippedRows: number;
}

// Reconciles a Google Sheet's Usage tab back into the local movement log.
// Pure and side-effect free (no storage or network access) so the actual
// merge logic can be reasoned about — and tested — independently of where
// the sheet rows or the "previously synced" set came from.
//
// The rule this implements is the customer's explicit choice: the sheet
// is the source of truth for any row that's ever been synced. Concretely:
//   - a sheet row whose Sync ID matches a local movement updates that
//     movement in place (quantity/date/item can all be corrected by
//     editing the sheet)
//   - a sheet row whose Sync ID doesn't match any local movement (e.g.
//     pulled for the first time on a new device, or another device
//     pushed it since this device last synced) is added under that same
//     id, so every device converges on one identity for the row
//   - a sheet row with a blank Sync ID (typed directly into the sheet,
//     never pushed from any device) is added as a new usage-import entry
//   - a local movement whose id was part of the *previous* sync but is
//     missing from the sheet now was deleted there, so it's deleted here
//     too. A local movement that was never synced (e.g. a scan recorded
//     since the last push) is left alone even though it's also "missing"
//     from the sheet — it just hasn't been pushed yet.
export function reconcileUsageFromSheetRows(
  sheetRows: UsageSheetRow[],
  localMovements: StockMovement[],
  items: InventoryItem[],
  previouslySyncedIds: Set<string>
): UsageReconcileResult {
  const byBarcode = new Map(items.filter((it) => it.barcode).map((it) => [it.barcode, it]));
  const localById = new Map(localMovements.map((m) => [m.id, m]));

  const unmatchedBarcodes = new Set<string>();
  const consumedLocalIds = new Set<string>();
  const nextSyncedIds = new Set<string>();
  const reconciled: StockMovement[] = [];
  let added = 0;
  let updated = 0;
  let skippedRows = 0;

  sheetRows.forEach((row, idx) => {
    if (!row.quantityUsed || !Number.isFinite(row.quantityUsed)) {
      skippedRows += 1;
      return;
    }
    const item = byBarcode.get(row.barcode);
    if (!item) {
      if (row.barcode) unmatchedBarcodes.add(row.barcode);
      skippedRows += 1;
      return;
    }
    const at = /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? `${row.date}T12:00:00.000Z` : new Date().toISOString();
    const desiredDelta = -Math.abs(row.quantityUsed);

    if (row.syncId) {
      nextSyncedIds.add(row.syncId);
      const existing = localById.get(row.syncId);
      if (existing && existing.delta < 0) {
        consumedLocalIds.add(row.syncId);
        if (existing.itemId !== item.id || existing.delta !== desiredDelta || existing.at.slice(0, 10) !== row.date) {
          updated += 1;
        }
        reconciled.push({ ...existing, itemId: item.id, delta: desiredDelta, at });
      } else {
        added += 1;
        reconciled.push({
          id: row.syncId,
          itemId: item.id,
          delta: desiredDelta,
          reason: REASON_FROM_LABEL[row.type] ?? "usage-import",
          at,
        });
      }
    } else {
      added += 1;
      reconciled.push({
        id: `sheet-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        itemId: item.id,
        delta: desiredDelta,
        reason: "usage-import",
        at,
      });
    }
  });

  let deleted = 0;
  const untouched = localMovements.filter((m) => {
    if (m.delta >= 0) return true; // restocks/imports are never touched by usage reconciliation
    if (consumedLocalIds.has(m.id)) return false; // superseded by the updated copy pushed into `reconciled` above
    if (previouslySyncedIds.has(m.id)) {
      deleted += 1;
      return false; // was synced before, no longer in the sheet — removed there
    }
    return true; // never synced — a recent local scan/adjustment that hasn't been pushed yet
  });

  return {
    movements: [...untouched, ...reconciled],
    syncedIds: Array.from(nextSyncedIds),
    added,
    updated,
    deleted,
    unmatchedBarcodes: Array.from(unmatchedBarcodes),
    skippedRows,
  };
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
