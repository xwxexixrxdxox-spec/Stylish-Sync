"use client";

import { InventoryItem } from "./types";
import { expandUpcEtoUpcA } from "./barcodeFormat";
import { lookupCommunityBarcode } from "./communityLookup";
import { lookupBarcodeCandidates } from "./productLookup";

// Bulk imports (a full inventory spreadsheet, or a barcode database being
// shared to the community lookup — see ImportExportPanel.tsx and
// ShareBarcodeDatabase.tsx) routinely carry barcodes shorter than the
// standard 12-digit UPC-A / 13-digit EAN length. Two real causes account
// for almost all of these:
//
//   - Spreadsheet software treats a barcode column as a number unless it's
//     explicitly formatted as text, which silently strips leading zeros —
//     a 12-digit UPC-A becomes 11 digits, a 13-digit EAN becomes 12, and
//     so on. This is extremely common and has nothing to do with how the
//     barcode is actually encoded.
//   - The barcode is a genuinely compressed 8-digit UPC-E code (see
//     barcodeFormat.ts) rather than a truncated UPC-A.
//
// Either way, a short barcode won't match anything a customer later scans
// with a real barcode scanner (which always reads the full-length code),
// so this repairs what it can *before* the item lands in inventory or gets
// shared to the community database — fixing it now means a future scan of
// the same product just works, instead of creating a permanent orphan
// entry nobody will ever match again.
//
// Deliberately best-effort and bounded: the UPCitemdb lookup this falls
// back to (see productLookup.ts / api/upc-lookup) shares one server-side
// trial quota across every customer of this app, not just whoever kicked
// off this import — so this always tries the free, effectively-unlimited
// community database first, and caps + throttles how much it will
// actually ask UPCitemdb during a single import.

// How many short barcodes a single import will attempt to repair at all.
// Chosen generously (a real catalog import can easily have this many), but
// bounded so a huge file can't turn into an unbounded background job.
const MAX_BARCODES_TO_REPAIR = 50;
// Of those, how many are allowed to actually reach UPCitemdb (the shared,
// rate-limited resource) — most repairs resolve via the free community
// database first, so this is normally never fully used.
const MAX_UPCITEMDB_CALLS = 20;
// Spacing enforced between UPCitemdb calls specifically. The shared
// server-side quota is 30 requests/60s across every customer combined
// (see api/upc-lookup/route.ts) — this alone would only allow ~20 calls/min
// even if this import had that whole budget to itself, so it stays well
// under that to leave headroom for everyone else hitting the same route.
const UPC_LOOKUP_SPACING_MS = 3000;

export interface BarcodeRepairResult {
  items: InventoryItem[];
  // How many short barcodes were attempted (bounded by MAX_BARCODES_TO_REPAIR).
  attempted: number;
  // How many of those were actually resolved to a full-length barcode.
  repaired: number;
}

function needsRepair(barcode: string): boolean {
  const trimmed = barcode.trim();
  // Only pure-digit barcodes are candidates — a custom SKU like "SKU-1042"
  // isn't a truncated UPC/EAN, there's nothing to decode or pad.
  return /^\d+$/.test(trimmed) && trimmed.length > 0 && trimmed.length < 12;
}

// Candidate full-length codes to try, in priority order (most likely /
// cheapest-to-be-right first). Deduplicated so a barcode that's already
// exactly 12 or 13 digits after padding isn't checked twice.
function candidatesFor(barcode: string): string[] {
  const candidates: string[] = [];
  const upcE = expandUpcEtoUpcA(barcode); // only succeeds for exactly-8-digit input
  if (upcE) candidates.push(upcE);
  candidates.push(barcode.padStart(12, "0"));
  candidates.push(barcode.padStart(13, "0"));
  if (barcode.length === 8) candidates.push(barcode); // could be a genuine EAN-8 UPCitemdb has on file as-is
  return Array.from(new Set(candidates));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Attempts to resolve every short barcode in `items` to its real
// full-length UPC/EAN by trying each candidate expansion against the free
// community database, then (budget permitting) UPCitemdb. Returns a new
// items array with resolved barcodes swapped in — items whose barcode
// wasn't short, or couldn't be resolved, pass through unchanged. Never
// throws; a lookup failure just leaves that item's barcode as originally
// imported.
export async function repairImportedBarcodes(
  items: InventoryItem[],
  onProgress?: (done: number, total: number) => void
): Promise<BarcodeRepairResult> {
  const toRepair = items.filter((it) => needsRepair(it.barcode)).slice(0, MAX_BARCODES_TO_REPAIR);
  if (!toRepair.length) return { items, attempted: 0, repaired: 0 };

  const resolved = new Map<string, string>(); // original (trimmed) barcode -> repaired barcode
  let upcItemDbCallsUsed = 0;

  for (let i = 0; i < toRepair.length; i++) {
    const original = toRepair[i].barcode.trim();
    onProgress?.(i, toRepair.length);

    for (const candidate of candidatesFor(original)) {
      const community = await lookupCommunityBarcode(candidate);
      if (community) {
        resolved.set(original, candidate);
        break;
      }
      if (upcItemDbCallsUsed >= MAX_UPCITEMDB_CALLS) continue; // budget spent - community-only for the rest
      await sleep(UPC_LOOKUP_SPACING_MS);
      const found = await lookupBarcodeCandidates(candidate);
      upcItemDbCallsUsed += 1;
      if (found.length > 0) {
        resolved.set(original, candidate);
        break;
      }
    }
  }
  onProgress?.(toRepair.length, toRepair.length);

  const repairedItems = items.map((it) => {
    const fixed = resolved.get(it.barcode.trim());
    return fixed ? { ...it, barcode: fixed } : it;
  });

  return { items: repairedItems, attempted: toRepair.length, repaired: resolved.size };
}
