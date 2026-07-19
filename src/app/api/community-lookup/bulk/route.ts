import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isRateLimited } from "@/lib/rateLimit";

// Bulk counterpart to /api/community-lookup's single-entry POST — backs
// the "share your barcode database" import (see
// ShareBarcodeDatabase.tsx / communityLookup.ts's
// contributeCommunityBarcodesBulk), where a customer contributes their
// whole barcode/UPC/SKU catalog in one pass instead of one fetch per row.
// Same shape and same first-write-wins rule as the single-entry route (see
// its file header) - a customer's import can only ever fill in barcodes
// nobody's claimed yet, never overwrite an existing entry. Deliberately
// still excludes price (see communityLookup.ts) - only barcode, name, and
// unit ever reach this endpoint or get stored.

const KEY_PREFIX = "community:barcode:";
const MAX_BARCODE_LEN = 64;
const MAX_NAME_LEN = 200;
const MAX_UNIT_LEN = 32;
const MAX_ENTRIES_PER_REQUEST = 500;

function normalizeBarcode(raw: string): string | null {
  const trimmed = raw.trim().slice(0, MAX_BARCODE_LEN);
  return trimmed || null;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  // A real catalog import is many requests of up to MAX_ENTRIES_PER_REQUEST
  // rows each (see contributeCommunityBarcodesBulk's client-side chunking).
  // 10 requests/min caps a single IP at roughly 5,000 rows/min - generous
  // for a genuine import while still bounding abuse of a login-free,
  // write-to-shared-storage endpoint.
  if (isRateLimited(`community-lookup-bulk:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many contributions. Slow down a bit." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length) {
    return NextResponse.json({ error: "entries is required." }, { status: 400 });
  }
  if (entries.length > MAX_ENTRIES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Send at most ${MAX_ENTRIES_PER_REQUEST} entries per request.` },
      { status: 400 }
    );
  }

  const cleaned = entries
    .map((e: any) => ({
      barcode: normalizeBarcode(typeof e?.barcode === "string" ? e.barcode : ""),
      name: typeof e?.name === "string" ? e.name.trim().slice(0, MAX_NAME_LEN) : "",
      unit: typeof e?.unit === "string" ? e.unit.trim().slice(0, MAX_UNIT_LEN) : "",
    }))
    .filter((e: { barcode: string | null; name: string; unit: string }): e is { barcode: string; name: string; unit: string } =>
      Boolean(e.barcode && e.name)
    );

  const invalid = entries.length - cleaned.length;
  if (!cleaned.length) {
    return NextResponse.json({ contributed: 0, alreadyClaimed: 0, invalid });
  }

  try {
    const redis = await getRedis();
    // NX = only set if this barcode has never been contributed before, same
    // as the single-entry route - pipelined via multi() so a several-
    // hundred-row batch is one round trip instead of hundreds.
    const multi = redis.multi();
    cleaned.forEach((e: { barcode: string; name: string; unit: string }) => {
      multi.set(`${KEY_PREFIX}${e.barcode}`, JSON.stringify({ name: e.name, unit: e.unit || "ea" }), { NX: true });
    });
    const results = await multi.exec();
    const contributed = results.filter((r: unknown) => r === "OK").length;
    return NextResponse.json({ contributed, alreadyClaimed: cleaned.length - contributed, invalid });
  } catch {
    return NextResponse.json(
      { error: "The shared database is temporarily unavailable. Try again shortly." },
      { status: 503 }
    );
  }
}
