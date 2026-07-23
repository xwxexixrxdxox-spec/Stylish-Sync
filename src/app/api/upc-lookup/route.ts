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
    if (!res.ok) return NextResponse.json({ name: null, price: null });
    const data = await res.json();
    const item = data?.items?.[0];
    const title: string | undefined = item?.title;

    // Best-effort "latest price": UPCitemdb returns an offers[] array of
    // per-merchant listings, each stamped with updated_t — the most
    // recently updated one with a real price is the closest thing the
    // provider has to current pricing. The recorded-price floor is the
    // fallback for products whose offers have all gone stale/zero. Either
    // way this is an online-listing estimate, not the customer's shelf
    // tag — the Scan UI shows a disclaimer to that effect whenever it
    // auto-fills.
    let price: number | null = null;
    const offers = Array.isArray(item?.offers) ? (item.offers as { price?: unknown; updated_t?: unknown }[]) : [];
    const latestOffer = offers
      .filter((o) => Number(o?.price) > 0)
      .sort((a, b) => (Number(b?.updated_t) || 0) - (Number(a?.updated_t) || 0))[0];
    if (latestOffer) price = Number(latestOffer.price);
    else if (Number(item?.lowest_recorded_price) > 0) price = Number(item.lowest_recorded_price);
    if (price !== null) price = Math.round(price * 100) / 100;

    return NextResponse.json({ name: title ?? null, price });
  } catch {
    // Provider unreachable/erroring — same as "nothing found," callers
    // already treat a null name as a silent miss, not an error state.
    return NextResponse.json({ name: null, price: null });
  }
}
