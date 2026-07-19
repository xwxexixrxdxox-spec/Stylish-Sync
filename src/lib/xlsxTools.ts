"use client";

import * as XLSX from "xlsx";
import { InventoryItem, StockMovement } from "./types";
import { USAGE_COLUMNS, movementsToUsageRows, weeklyUsageTotals } from "./usageReport";

// Import/export supporting Excel (.xlsx), LibreOffice (.ods), and CSV —
// the same formats the original apps advertised. SheetJS reads/writes all
// three from the same code path, so there's one implementation to keep in
// sync rather than three.
//
// This is the free/Community build of SheetJS (see package.json), which
// can't write native embedded chart objects into a workbook — that's a
// Pro-only feature. So the "chart" in the Usage sheet below is a plain
// text bar built from block characters, not a real chart object. That's a
// deliberate downgrade from the Google Sheets sync (googleSheets.ts),
// which *can* insert a real native chart via the Sheets API — that's a
// plain REST call, not gated by this library's free/paid split.

const COLUMNS: string[] = ["Barcode", "Name", "Quantity", "Unit", "Price Per Unit", "Reorder At", "Location"];

export function exportItems(
  items: InventoryItem[],
  movements: StockMovement[],
  format: "xlsx" | "ods" | "csv",
  filename = "inventory"
): void {
  const inventoryRows: (string | number)[][] = [
    COLUMNS,
    ...items.map((it) => [it.barcode, it.name, it.quantity, it.unit, it.pricePerUnit, it.reorderAt, it.location || ""]),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(inventoryRows), "Inventory");

  // CSV can only ever hold one table — skip the Usage sheet there rather
  // than smashing two differently-shaped tables into the same flat file,
  // where they'd corrupt each other's column structure.
  if (format !== "csv") {
    XLSX.utils.book_append_sheet(workbook, buildUsageWorksheet(items, movements), "Usage");
  }

  const bookType = format === "xlsx" ? "xlsx" : format === "ods" ? "ods" : "csv";
  XLSX.writeFile(workbook, `${filename}.${format}`, { bookType });
}

const BAR_WIDTH = 24;

function buildUsageWorksheet(items: InventoryItem[], movements: StockMovement[]) {
  const weekly = weeklyUsageTotals(movements);
  const maxTotal = Math.max(1, ...weekly.map((w) => w.total));

  const summaryRows: (string | number)[][] = [
    ["Weekly usage summary (all items combined)"],
    ["Week Starting", "Total Units Used", "Chart"],
    ...weekly.map((w) => [
      w.weekStart,
      w.total,
      "█".repeat(Math.max(w.total > 0 ? 1 : 0, Math.round((w.total / maxTotal) * BAR_WIDTH))),
    ]),
  ];
  if (!weekly.length) summaryRows.push(["No usage logged yet."]);

  const detailRows: (string | number)[][] = [
    [],
    ["Usage detail — one row per logged use (matches the usage-import template format, so this can be edited and re-imported)"],
    USAGE_COLUMNS,
    ...movementsToUsageRows(movements, items).map((r) => [r.barcode, r.itemName, r.date, r.quantityUsed, r.type, r.note]),
  ];

  return XLSX.utils.aoa_to_sheet([...summaryRows, ...detailRows]);
}

const USAGE_TEMPLATE_COLUMNS = ["Barcode", "Date", "Quantity Used", "Note"];

// A blank starter file for the "Import usage history" flow — gives
// customers the exact column headers the importer looks for (plus one
// example row) instead of making them guess the format from a paragraph
// of instructions.
export function downloadUsageTemplate(): void {
  const rows: (string | number)[][] = [
    USAGE_TEMPLATE_COLUMNS,
    ["8412345678905", "2026-01-15", 6, "Example row — delete before importing"],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Usage template");
  XLSX.writeFile(workbook, "usage-import-template.csv", { bookType: "csv" });
}

export interface ImportResult {
  items: InventoryItem[];
  skippedRows: number;
}

export async function importItemsFromFile(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  const [header, ...dataRows] = rows;
  const idx = buildColumnIndex(header as string[]);

  let skipped = 0;
  const items: InventoryItem[] = [];
  dataRows.forEach((row, i) => {
    const barcode = String(row[idx.barcode] ?? "").trim();
    const name = String(row[idx.name] ?? "").trim();
    if (!name) {
      skipped += 1;
      return;
    }
    const location = String(row[idx.location] ?? "").trim();
    items.push({
      id: `import-${Date.now()}-${i}`,
      barcode,
      name,
      quantity: Number(row[idx.quantity] ?? 0) || 0,
      unit: String(row[idx.unit] ?? "ea"),
      pricePerUnit: Number(row[idx.price] ?? 0) || 0,
      reorderAt: Number(row[idx.reorderAt] ?? 0) || 0,
      updatedAt: new Date().toISOString(),
      location: location || undefined,
    });
  });

  return { items, skippedRows: skipped };
}

function buildColumnIndex(header: string[]) {
  const norm = (header ?? []).map((h) => String(h ?? "").trim().toLowerCase());
  const find = (...candidates: string[]) => {
    for (const c of candidates) {
      const i = norm.indexOf(c);
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    barcode: find("barcode", "upc", "sku"),
    name: find("name", "item description", "description", "item"),
    quantity: find("quantity", "qty"),
    unit: find("unit"),
    price: find("price per unit", "price", "unit price"),
    reorderAt: find("reorder at", "reorder", "reorder level"),
    location: find("location", "storage location", "bin", "aisle"),
  };
}

export interface UsageImportResult {
  movements: Omit<StockMovement, "id">[];
  importedRows: number;
  skippedRows: number;
  // Unique barcodes that appeared in the file but didn't match any current
  // item — surfaced separately from the generic skip count so a customer
  // can tell "I have a typo" apart from "this row was just malformed."
  unmatchedBarcodes: string[];
}

// Parses a customer-supplied usage-history file (same barcode/date/quantity
// format as downloadUsageTemplate produces, and the same shape the Usage
// sheet's detail table exports in) into movements ready for
// storage.logMovements. Every row becomes a negative-delta "usage-import"
// movement — this importer is specifically for backfilling historical
// usage, not for restocks or arbitrary adjustments.
export async function importUsageFromFile(file: File, items: InventoryItem[]): Promise<UsageImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  const [header, ...dataRows] = rows;
  const idx = buildUsageColumnIndex(header as string[]);
  const byBarcode = new Map(items.filter((it) => it.barcode).map((it) => [it.barcode, it]));

  let skipped = 0;
  const unmatched = new Set<string>();
  const movements: Omit<StockMovement, "id">[] = [];

  dataRows.forEach((row) => {
    const barcode = String(row[idx.barcode] ?? "").trim();
    const qty = Number(row[idx.quantity]);
    if (!barcode || !Number.isFinite(qty) || qty <= 0) {
      skipped += 1;
      return;
    }
    const item = byBarcode.get(barcode);
    if (!item) {
      skipped += 1;
      unmatched.add(barcode);
      return;
    }
    const at = parseUsageDate(row[idx.date]);
    if (!at) {
      skipped += 1;
      return;
    }
    movements.push({ itemId: item.id, delta: -Math.abs(qty), reason: "usage-import", at });
  });

  return {
    movements,
    importedRows: movements.length,
    skippedRows: skipped,
    unmatchedBarcodes: Array.from(unmatched),
  };
}

function buildUsageColumnIndex(header: string[]) {
  const norm = (header ?? []).map((h) => String(h ?? "").trim().toLowerCase());
  const find = (...candidates: string[]) => {
    for (const c of candidates) {
      const i = norm.indexOf(c);
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    barcode: find("barcode", "upc", "sku"),
    date: find("date", "usage date"),
    quantity: find("quantity used", "quantity", "qty", "qty used", "amount used"),
  };
}

// Accepts either an Excel/Sheets date serial (a plain number, when the
// customer's spreadsheet app stored a real date-typed cell) or a
// "YYYY-MM-DD"/otherwise-parseable date string, and normalizes to an ISO
// timestamp anchored at local noon. Noon (not midnight) avoids a date
// silently shifting a day earlier/later purely because a timezone offset
// pushed midnight onto the wrong side of the calendar boundary.
function parseUsageDate(raw: any): string | null {
  if (typeof raw === "number") {
    // Excel/Sheets date serial: days since 1899-12-30.
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)).toISOString();
  }
  const s = String(raw ?? "").trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), 12)).toISOString();
  }
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12)).toISOString();
}
