"use client";

import { useRef, useState } from "react";
import { Upload, Download, ChevronDown } from "lucide-react";
import { InventoryItem } from "@/lib/types";
import { exportItems, importItemsFromFile } from "@/lib/xlsxTools";
import { repairImportedBarcodes } from "@/lib/barcodeRepair";
import { loadMovements } from "@/lib/storage";

interface Props {
  items: InventoryItem[];
  onImport: (items: InventoryItem[]) => void;
}

export default function ImportExportPanel({ items, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [repairProgress, setRepairProgress] = useState<{ done: number; total: number } | null>(null);

  const handleFile = async (file: File) => {
    try {
      const { items: imported, skippedRows } = await importItemsFromFile(file);
      // Barcodes shorter than 12 digits are usually either a spreadsheet
      // that stripped a leading zero, or a compressed 8-digit UPC-E code —
      // see barcodeRepair.ts. Worth attempting before committing to
      // inventory, since a scan later on won't match a truncated barcode.
      const { items: repaired, attempted, repaired: repairedCount } = await repairImportedBarcodes(
        imported,
        (done, total) => setRepairProgress({ done, total })
      );
      onImport(repaired);
      const parts = [`Imported ${repaired.length} item${repaired.length === 1 ? "" : "s"}`];
      if (attempted) parts.push(`fixed ${repairedCount} of ${attempted} short barcode${attempted === 1 ? "" : "s"}`);
      if (skippedRows) parts.push(`${skippedRows} row${skippedRows === 1 ? "" : "s"} skipped — missing a name`);
      setStatus(parts.join(", ") + ".");
    } catch (e) {
      setStatus("Couldn't read that file. Make sure it's a valid .xlsx, .ods, or .csv export.");
    } finally {
      setRepairProgress(null);
      setTimeout(() => setStatus(null), 6000);
    }
  };

  return (
    <div className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
      <p className="mb-3 text-sm font-medium text-neutral-900">Import & export</p>
      <div className="flex gap-2">
        <button
          onClick={() => fileInput.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-surface-border py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted"
        >
          <Upload size={15} /> Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.ods,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.currentTarget.value = "";
          }}
        />

        <div className="relative flex-1">
          <button
            onClick={() => setExportMenuOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2 text-sm font-medium text-brand-foreground hover:opacity-90"
          >
            <Download size={15} /> Export <ChevronDown size={14} />
          </button>
          {exportMenuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-lg border border-surface-border bg-white shadow-card">
              {(["xlsx", "ods", "csv"] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => {
                    exportItems(items, loadMovements(), fmt);
                    setExportMenuOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
                >
                  {fmt === "xlsx" ? "Excel (.xlsx)" : fmt === "ods" ? "LibreOffice (.ods)" : "CSV (.csv)"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Supports Excel (.xlsx), LibreOffice (.ods), and CSV. Excel/LibreOffice exports also include a Usage sheet
        (history + summary chart); CSV is Inventory-only.
      </p>
      {repairProgress && (
        <p className="mt-2 text-xs text-neutral-500">
          Checking short barcodes… {repairProgress.done} / {repairProgress.total}
        </p>
      )}
      {status && <p className="mt-2 text-xs font-medium text-neutral-700">{status}</p>}
    </div>
  );
}
