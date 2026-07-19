"use client";

// Crowdsourced barcode -> product lookup, shared across every customer's
// device (unlike lookupBarcode in productLookup.ts, which only ever talks
// to the external UPC lookup service and never remembers anything). When a
// customer manually types in a name/unit for a barcode nobody's seen
// before, ScanTab.tsx contributes that entry here so the next customer who
// scans the same barcode gets it auto-filled instead of typing it in too.
// contributeCommunityBarcodesBulk below is the same idea at catalog scale -
// a customer importing their own UPC/SKU database in one go (see
// ShareBarcodeDatabase.tsx) rather than one barcode at a time.
//
// Deliberately excludes price - the whole point of this being "shared" is
// that it's pooled across strangers' businesses, and one shop's price is
// meaningless (or actively misleading) applied to another's. Every write is
// first-write-wins (enforced server-side, see the API route) so a bad or
// malicious entry can't silently overwrite a correct one someone else
// already contributed.

export interface CommunityBarcodeEntry {
  name: string;
  unit: string;
}

export async function lookupCommunityBarcode(barcode: string): Promise<CommunityBarcodeEntry | null> {
  try {
    const res = await fetch(`/api/community-lookup?barcode=${encodeURIComponent(barcode)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.entry ?? null;
  } catch {
    return null;
  }
}

// Fire-and-forget by design - a failed or slow contribution should never
// block or interrupt someone adding stock to their own inventory, which is
// why callers don't await this in any way that affects the UI.
export async function contributeCommunityBarcode(barcode: string, name: string, unit: string): Promise<void> {
  try {
    await fetch("/api/community-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcode, name, unit }),
    });
  } catch {
    // Best-effort - the item was already added to the customer's own
    // inventory regardless of whether this succeeded.
  }
}

export interface BulkContributeResult {
  contributed: number;
  alreadyClaimed: number;
  invalid: number;
  failedBatches: number;
}

const BULK_BATCH_SIZE = 500;

// Contributes many barcode -> name/unit entries at once - what backs
// "share your barcode database" (see ShareBarcodeDatabase.tsx), where a
// customer imports their whole UPC/SKU catalog into the shared lookup
// above in one action instead of scanning each barcode individually.
// Unlike the single-entry contribute above, this is NOT fire-and-forget:
// the caller is showing the customer a real result (how many were newly
// shared vs. already claimed by someone else), so this awaits every batch
// and returns running totals. Batches are sent one after another rather
// than all at once, both to stay under the bulk API route's per-request
// cap and so a large catalog import doesn't fire a burst of simultaneous
// requests against that route's rate limit. onProgress fires after every
// batch so a big file shows real progress instead of one long silent wait.
export async function contributeCommunityBarcodesBulk(
  entries: { barcode: string; name: string; unit: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<BulkContributeResult> {
  const totals: BulkContributeResult = { contributed: 0, alreadyClaimed: 0, invalid: 0, failedBatches: 0 };
  for (let i = 0; i < entries.length; i += BULK_BATCH_SIZE) {
    const batch = entries.slice(i, i + BULK_BATCH_SIZE);
    try {
      const res = await fetch("/api/community-lookup/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: batch }),
      });
      if (!res.ok) {
        totals.failedBatches += 1;
      } else {
        const data = await res.json();
        totals.contributed += data.contributed ?? 0;
        totals.alreadyClaimed += data.alreadyClaimed ?? 0;
        totals.invalid += data.invalid ?? 0;
      }
    } catch {
      totals.failedBatches += 1;
    }
    onProgress?.(Math.min(i + BULK_BATCH_SIZE, entries.length), entries.length);
  }
  return totals;
}
