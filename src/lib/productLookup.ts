"use client";

// Best-effort barcode -> product name lookup, matching the ISC app's
// "Auto-fills from lookup, or type your own" behavior. Uses UPCitemdb's
// free trial endpoint by default (no key required, rate-limited); swap in
// a paid provider by setting NEXT_PUBLIC_UPC_LOOKUP_URL to your own
// endpoint that accepts ?upc=<code> and returns { name: string }.
// Lookup failures are silent by design — manual entry always works.

export async function lookupBarcode(barcode: string): Promise<string | null> {
  const customUrl = process.env.NEXT_PUBLIC_UPC_LOOKUP_URL;
  try {
    if (customUrl) {
      const res = await fetch(`${customUrl}?upc=${encodeURIComponent(barcode)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.name ?? null;
    }

    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const title: string | undefined = data?.items?.[0]?.title;
    return title ?? null;
  } catch {
    return null;
  }
}
