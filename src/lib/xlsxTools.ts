"use client";

import * as XLSX from "xlsx";
import { InventoryItem } from "./types";

// Import/export supporting Excel (.xlsx), LibreOffice (.ods), and CSV —
// the same formats the original apps advertised. SheetJS reads/writes all
// three from the same code path, so there's one implementation to keep in
// sync rather than three.

const COLUMNS: string[] = ["Barcode", "Name", "Quantity", "Unit", "Price Per Unit", "Reorder At"];

export function exportItems(items: InventoryItem[], format: "xlsx" | "ods" | "csv", filename = "inventory"): void {
  const rows: (string | number)[][] = [
    COLUMNS,
    ...items.map((it) => [it.barcode, it.name, it.quantity, it.unit, it.pricePerUnit, it.reorderAt]),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");

  const bookType = format === "xlsx" ? "xlsx" : format === "ods" ? "ods" : "csv";
  XLSX.writeFile(workbook, `${filename}.${format}`, { bookType });
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
    items.push({
      id: `import-${Date.now()}-${i}`,
      barcode,
      name,
      quantity: Number(row[idx.quantity] ?? 0) || 0,
      unit: String(row[idx.unit] ?? "ea"),
      pricePerUnit: Number(row[idx.price] ?? 0) || 0,
      reorderAt: Number(row[idx.reorderAt] ?? 0) || 0,
      updatedAt: new Date().toISOString(),
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
  };
}
