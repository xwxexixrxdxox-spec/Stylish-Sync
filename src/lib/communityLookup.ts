"use client";

// Crowdsourced barcode -> product lookup, shared across every customer's
// device (unlike lookupBarcode in productLookup.ts, which only ever talks
// to the external UPC lookup service and never remembers anything). When a
// customer manually types in a name/unit for a barcode nobody's seen
// before, ScanTab.tsx contributes that entry here so the next customer who
// scans the same barcode gets it auto-filled instead of typing it in too.
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
