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

export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult | null> {
  const customUrl = process.env.NEXT_PUBLIC_UPC_LOOKUP_URL;
  try {
    const url = customUrl
      ? `${customUrl}?upc=${encodeURIComponent(barcode)}`
      : `/api/upc-lookup?upc=${encodeURIComponent(barcode)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.name) return null;
    const price = Number(data.price);
    return { name: data.name, price: Number.isFinite(price) && price > 0 ? price : null };
  } catch {
    return null;
  }
}
