"use client";

// Best-effort barcode -> product name + latest-price lookup, matching the
// ISC app's "Auto-fills from lookup, or type your own" behavior. Uses
// UPCitemdb's free trial endpoint by default (no key required); swap in a
// paid provider by setting NEXT_PUBLIC_UPC_LOOKUP_URL to your own endpoint
// that accepts ?upc=<code> and returns { name: string, price?: number }.
// Lookup failures are silent by design — manual entry always works.
//
// The default provider is fetched through our own /api/upc-lookup route
// rather than directly from the browser — see that route's file header
// for why: UPCitemdb's trial endpoint now blocks direct browser/CORS
// requests outright (confirmed by testing), so a client-side fetch to it
// fails 100% of the time regardless of barcode. A custom
// NEXT_PUBLIC_UPC_LOOKUP_URL is assumed to already be CORS-friendly for
// direct browser use, so that path is left as a direct client fetch.

export interface BarcodeLookupResult {
  name: string;
  // Best-effort latest price from the provider's online listings (see
  // api/upc-lookup for how it's chosen): a market estimate that moves over
  // time, never a statement of the customer's own retail tag — callers
  // that auto-fill it must show a disclaimer saying so. Null when the
  // provider knew the product but had no usable price.
  price: number | null;
}

// UPCitemdb (the default provider) can return several listings for one
// barcode — the same UPC gets reused/relabeled across regions, sellers, or
// product variants — so a lookup is genuinely a list of candidates, not one
// guaranteed-right answer. This always returns an array (possibly empty on
// a miss) so callers decide how to handle 0 / 1 / many themselves, rather
// than this module silently picking "the first one" on their behalf.
export async function lookupBarcodeCandidates(barcode: string): Promise<BarcodeLookupResult[]> {
  const customUrl = process.env.NEXT_PUBLIC_UPC_LOOKUP_URL;
  try {
    // A self-hosted/paid NEXT_PUBLIC_UPC_LOOKUP_URL provider is a documented
    // external contract (single { name, price? } per barcode) — changing
    // that shape would break anyone who's already pointed their own
    // deployment at a custom provider, so it's kept as single-result and
    // just wrapped into a one-item (or empty) candidates array here. Only
    // our own default /api/upc-lookup route (below) speaks the newer
    // multi-candidate shape.
    if (customUrl) {
      const res = await fetch(`${customUrl}?upc=${encodeURIComponent(barcode)}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.name) return [];
      const price = Number(data.price);
      return [{ name: data.name, price: Number.isFinite(price) && price > 0 ? price : null }];
    }

    const res = await fetch(`/api/upc-lookup?upc=${encodeURIComponent(barcode)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const candidates: unknown[] = Array.isArray(data?.candidates) ? data.candidates : [];
    return candidates
      .map((c) => {
        const item = c as { name?: unknown; price?: unknown };
        if (typeof item.name !== "string" || !item.name) return null;
        const price = Number(item.price);
        return { name: item.name, price: Number.isFinite(price) && price > 0 ? price : null };
      })
      .filter((c): c is BarcodeLookupResult => c !== null);
  } catch {
    return [];
  }
}
