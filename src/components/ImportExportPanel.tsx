"use client";

import { useRef, useState } from "react";
import { Upload, Download, ChevronDown } from "lucide-react";
import { InventoryItem } from "@/lib/types";
import { exportItems, importItemsFromFile } from "@/lib/xlsxTools";

interface Props {
  items: InventoryItem[];
  onImport: (items: InventoryItem[]) => void;
}

export default function ImportExportPanel({ items, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    try {
      const { items: imported, skippedRows } = await importItemsFromFile(file);
      onImport(imported);
      setStatus(
        `Imported ${imported.length} item${imported.length === 1 ? "" : "s"}` +
          (skippedRows ? ` (${skippedRows} row${skippedRows === 1 ? "" : "s"} skipped — missing a name).` : ".")
      );
    } catch (e) {
      setStatus("Couldn't read that file. Make sure it's a valid .xlsx, .ods, or .csv export.");
    } finally {
      setTimeout(() => setStatus(null), 5000);
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
                    exportItems(items, fmt);
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
      <p className="mt-2 text-xs text-neutral-500">Supports Excel (.xlsx), LibreOffice (.ods), and CSV.</p>
      {status && <p className="mt-2 text-xs font-medium text-neutral-700">{status}</p>}
    </div>
  );
}
