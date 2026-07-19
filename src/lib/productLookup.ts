"use client";

// Best-effort barcode -> product name lookup, matching the ISC app's
// "Auto-fills from lookup, or type your own" behavior. Uses UPCitemdb's
// free trial endpoint by default (no key required); swap in a paid
// provider by setting NEXT_PUBLIC_UPC_LOOKUP_URL to your own endpoint
// that accepts ?upc=<code> and returns { name: string }.
// Lookup failures are silent by design — manual entry always works.
//
// The default provider is fetched through our own /api/upc-lookup route
// rather than directly from the browser — see that route's file header
// for why: UPCitemdb's trial endpoint now blocks direct browser/CORS
// requests outright (confirmed by testing), so a client-side fetch to it
// fails 100% of the time regardless of barcode. A custom
// NEXT_PUBLIC_UPC_LOOKUP_URL is assumed to already be CORS-friendly for
// direct browser use, so that path is left as a direct client fetch.

export async function lookupBarcode(barcode: string): Promise<string | null> {
  const customUrl = process.env.NEXT_PUBLIC_UPC_LOOKUP_URL;
  try {
    if (customUrl) {
      const res = await fetch(`${customUrl}?upc=${encodeURIComponent(barcode)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.name ?? null;
    }

    const res = await fetch(`/api/upc-lookup?upc=${encodeURIComponent(barcode)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.name ?? null;
  } catch {
    return null;
  }
}
