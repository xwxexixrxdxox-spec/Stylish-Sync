"use client";

import { useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { importItemsFromFile } from "@/lib/xlsxTools";
import { contributeCommunityBarcodesBulk } from "@/lib/communityLookup";
import { repairImportedBarcodes } from "@/lib/barcodeRepair";
import ConfirmDialog from "./ConfirmDialog";

// Lets a customer contribute their own barcode/UPC/SKU catalog to the
// shared community lookup database (see communityLookup.ts) that quietly
// backs "no product found" scans app-wide - so importing here can fill in
// auto-fill matches for every OTHER customer's scans too, not just this
// one's own inventory.
//
// Reuses the same file parser as the regular inventory import
// (importItemsFromFile), but only barcode/name/unit ever leave this
// device: quantity, price, reorder level, and location are read from the
// file if present (importItemsFromFile always returns them) but simply
// never make it into the payload sent to the bulk API route - none of
// that makes sense shared across unrelated businesses, and the community
// endpoints don't even accept those fields.
//
// This is the one import path in the app that shares data with strangers
// rather than keeping it local to the device (or the customer's own
// linked Google Sheet), so it's gated behind an explicit disclaimer/
// consent step (ConfirmDialog) - nothing is sent until the customer
// affirmatively agrees to what, specifically, gets shared.
export default function ShareBarcodeDatabase() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [repairProgress, setRepairProgress] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handlePick = (file: File) => {
    setStatus(null);
    setPendingFile(file);
    setConfirming(true);
  };

  const handleConfirm = async () => {
    if (!pendingFile) return;
    setBusy(true);
    try {
      const { items: parsed } = await importItemsFromFile(pendingFile);
      // Repair short barcodes (stripped leading zeros, compressed UPC-E
      // codes — see barcodeRepair.ts) before sharing them - a truncated
      // barcode contributed as-is would never match anyone's real scan, so
      // this is the one chance to fix it before it's permanently on file.
      const { items, attempted, repaired } = await repairImportedBarcodes(parsed, (done, total) =>
        setRepairProgress({ done, total })
      );
      setRepairProgress(null);

      const entries = items
        .filter((it) => it.barcode.trim() && it.name.trim())
        .map((it) => ({ barcode: it.barcode.trim(), name: it.name.trim(), unit: it.unit || "ea" }));

      if (!entries.length) {
        setStatus("No rows with both a barcode and a name were found in that file — nothing was shared.");
        return;
      }

      const result = await contributeCommunityBarcodesBulk(entries, (done, total) => setProgress({ done, total }));
      const parts: string[] = [];
      if (result.contributed) parts.push(`${result.contributed} new`);
      if (result.alreadyClaimed) parts.push(`${result.alreadyClaimed} already in the shared database`);
      if (result.invalid) parts.push(`${result.invalid} skipped (missing barcode or name)`);
      if (result.failedBatches) parts.push(`${result.failedBatches} batch(es) failed — try importing again later`);
      if (attempted) parts.push(`fixed ${repaired} of ${attempted} short barcode${attempted === 1 ? "" : "s"} first`);
      setStatus(`Checked ${entries.length} barcode(s): ${parts.join(", ") || "nothing new to share"}.`);
    } catch {
      setStatus("Couldn't read that file. Make sure it's a valid .xlsx, .ods, or .csv export.");
    } finally {
      setBusy(false);
      setProgress(null);
      setRepairProgress(null);
      setConfirming(false);
      setPendingFile(null);
      setTimeout(() => setStatus(null), 8000);
    }
  };

  return (
    <div className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
      <p className="mb-1 text-sm font-medium text-neutral-900">Share your barcode database</p>
      <p className="mb-3 text-xs text-neutral-500">
        Have your own UPC/SKU catalog? Contribute it to the shared barcode database so scanning those codes
        auto-fills a name for every WS Inventory Management customer — not just you.
      </p>
      <button
        onClick={() => fileInput.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
      >
        <Share2 size={15} /> {busy ? "Sharing…" : "Import & share"}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.ods,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handlePick(f);
          e.currentTarget.value = "";
        }}
      />
      {busy && repairProgress && (
        <p className="mt-2 text-xs text-neutral-500">
          Checking short barcodes… {repairProgress.done} / {repairProgress.total}
        </p>
      )}
      {busy && !repairProgress && progress && (
        <p className="mt-2 text-xs text-neutral-500">
          Sharing {progress.done} / {progress.total}…
        </p>
      )}
      {status && <p className="mt-2 text-xs font-medium text-neutral-700">{status}</p>}

      {confirming && pendingFile && (
        <ConfirmDialog
          title="Share this barcode database?"
          message={
            `This adds every barcode in "${pendingFile.name}" to a database shared across all WS Inventory ` +
            `Management customers, including ones you have no relationship with. Only the barcode number, item ` +
            `description, and unit of measure (e.g. "ea", "case", "pack") are shared. Quantity, price, reorder ` +
            `level, and location are never sent — they stay on this device. This has no effect on any pricing ` +
            `or sales you have tied to these barcodes elsewhere; it only helps other customers' scans auto-fill ` +
            `a name. A barcode someone else already contributed won't be overwritten by yours. This can't be ` +
            `undone once shared.`
          }
          confirmLabel="I understand, share barcodes"
          busy={busy}
          onCancel={() => {
            setConfirming(false);
            setPendingFile(null);
          }}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
