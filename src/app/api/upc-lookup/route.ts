import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rateLimit";

// Server-side proxy for the default UPC lookup provider (UPCitemdb's free
// trial endpoint). This used to be called directly from the browser (see
// the git history of productLookup.ts) — but UPCitemdb's trial endpoint
// now returns a 503 with no CORS headers for *any* direct browser/CORS
// request, regardless of the barcode. Confirmed by testing identical UPCs
// both from a live browser tab (fails every time, "Failed to fetch") and
// as a plain server-to-server request (succeeds, real product data) —
// so this isn't a rate limit or a bad barcode, it's the provider having
// cut off client-side access entirely at some point. Routing the request
// through our own server here is now the only way to reach it at all,
// and mirrors how community-lookup/route.ts already proxies the
// crowdsourced lookup for the same "server calls work, browser calls
// don't" shape of problem.
//
// A self-hosted deployment using NEXT_PUBLIC_UPC_LOOKUP_URL (its own paid
// provider) doesn't go through this route at all — productLookup.ts only
// falls back to this proxy when no custom URL is configured, since a
// custom provider is assumed to already be CORS-friendly for direct
// browser use.

const MAX_BARCODE_LEN = 64;
// UPCitemdb can legitimately return several listings for one UPC (the same
// barcode gets reused/relabeled across regions, sellers, or product
// variants) - only ever using items[0] silently committed to whichever one
// happened to sort first, even when it was the wrong one. Capped at 5 so
// the Scan tab's picker stays a quick glance, not a wall of near-duplicates.
const MAX_CANDIDATES = 5;

interface Candidate {
  name: string;
  price: number | null;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  // Every customer's default-provider lookups now originate from this
  // app's own server instead of each customer's own residential IP, so
  // they all draw against one shared UPCitemdb trial quota. This limit
  // exists to keep one customer's scanning burst from starving everyone
  // else's lookups that day, not to protect against abuse the way
  // community-lookup's limits do.
  if (isRateLimited(`upc-lookup:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many lookups. Slow down a bit." }, { status: 429 });
  }

  const barcode = (req.nextUrl.searchParams.get("upc") ?? "").trim().slice(0, MAX_BARCODE_LEN);
  if (!barcode) {
    return NextResponse.json({ error: "upc is required." }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`);
    if (!res.ok) return NextResponse.json({ candidates: [] });
    const data = await res.json();
    const items: unknown[] = Array.isArray(data?.items) ? data.items : [];

    const candidates: Candidate[] = [];
    const seenTitles = new Set<string>();
    for (const raw of items) {
      if (candidates.length >= MAX_CANDIDATES) break;
      const item = raw as { title?: unknown; offers?: unknown; lowest_recorded_price?: unknown };
      const title = typeof item.title === "string" ? item.title.trim() : "";
      if (!title) continue;
      // Same product listed twice (e.g. identical title from two
      // merchants) shouldn't show up as two "different" choices in the
      // picker — dedupe case-insensitively on the title.
      const dedupeKey = title.toLowerCase();
      if (seenTitles.has(dedupeKey)) continue;
      seenTitles.add(dedupeKey);

      // Best-effort "latest price": UPCitemdb returns an offers[] array of
      // per-merchant listings, each stamped with updated_t — the most
      // recently updated one with a real price is the closest thing the
      // provider has to current pricing. The recorded-price floor is the
      // fallback for products whose offers have all gone stale/zero. Either
      // way this is an online-listing estimate, not the customer's shelf
      // tag — the Scan UI shows a disclaimer to that effect whenever it
      // auto-fills.
      let price: number | null = null;
      const offers = Array.isArray(item.offers) ? (item.offers as { price?: unknown; updated_t?: unknown }[]) : [];
      const latestOffer = offers
        .filter((o) => Number(o?.price) > 0)
        .sort((a, b) => (Number(b?.updated_t) || 0) - (Number(a?.updated_t) || 0))[0];
      if (latestOffer) price = Number(latestOffer.price);
      else if (Number(item.lowest_recorded_price) > 0) price = Number(item.lowest_recorded_price);
      if (price !== null) price = Math.round(price * 100) / 100;

      candidates.push({ name: title, price });
    }

    return NextResponse.json({ candidates });
  } catch {
    // Provider unreachable/erroring — same as "nothing found," callers
    // already treat an empty candidates array as a silent miss, not an
    // error state.
    return NextResponse.json({ candidates: [] });
  }
}
