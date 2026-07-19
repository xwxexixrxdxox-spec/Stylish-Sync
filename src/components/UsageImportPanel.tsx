"use client";

import { useRef, useState } from "react";
import { Upload, Download } from "lucide-react";
import { InventoryItem } from "@/lib/types";
import { importUsageFromFile, downloadUsageTemplate } from "@/lib/xlsxTools";
import { logMovements } from "@/lib/storage";

interface Props {
  items: InventoryItem[];
  // Called after a successful import so the caller can reload movements
  // from storage — this component doesn't hold movement state itself.
  onImported: () => void;
}

// Lets a customer backfill usage history from before they started using
// this app (or from a paper/spreadsheet process they're migrating off of)
// — see downloadUsageTemplate for the expected format. Matches rows to
// items by barcode; anything that doesn't match is reported, not silently
// dropped.
export default function UsageImportPanel({ items, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const { movements, importedRows, skippedRows, unmatchedBarcodes } = await importUsageFromFile(file, items);
      if (importedRows) logMovements(movements);
      const parts = [`Imported ${importedRows} usage row${importedRows === 1 ? "" : "s"}.`];
      if (unmatchedBarcodes.length) {
        parts.push(
          `${unmatchedBarcodes.length} barcode${unmatchedBarcodes.length === 1 ? "" : "s"} didn't match an item in your inventory.`
        );
      }
      const otherSkipped = skippedRows - unmatchedBarcodes.length;
      if (otherSkipped > 0) {
        parts.push(`${otherSkipped} row${otherSkipped === 1 ? "" : "s"} skipped — missing or invalid data.`);
      }
      setStatus(parts.join(" "));
      if (importedRows) onImported();
    } catch {
      setStatus("Couldn't read that file. Download the template below to check the expected format.");
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(null), 8000);
    }
  };

  return (
    <div className="mb-4 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
      <p className="mb-1 text-sm font-medium text-neutral-900">Import usage history</p>
      <p className="mb-3 text-xs text-neutral-500">
        Have usage data from before you started using this app? Import it so it shows up in this chart, and in your
        exports and Google Sheet.
      </p>
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-surface-border py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
        >
          <Upload size={15} /> {busy ? "Importing…" : "Import"}
        </button>
        <button
          onClick={() => downloadUsageTemplate()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-surface-border py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted"
        >
          <Download size={15} /> Template
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
      </div>
      {status && <p className="mt-2 text-xs font-medium text-neutral-700">{status}</p>}
    </div>
  );
}
