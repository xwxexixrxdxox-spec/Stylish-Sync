import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isRateLimited } from "@/lib/rateLimit";

// Backs the shared, crowdsourced barcode database (see communityLookup.ts):
// one Redis key per barcode, written at most once per barcode ("NX" - set
// only if that key doesn't already exist). That first-write-wins rule is
// the entire abuse defense here - this app has no login system, so nothing
// stops a bad actor from POSTing a wrong name for some barcode, but at
// least they can only ever plant one bad entry per (as-yet-unclaimed)
// barcode rather than overwrite whatever's already there. Reuses the same
// Redis instance the live-chat feature already depends on (REDIS_URL) - see
// src/lib/redis.ts - so no new infrastructure is required.

const KEY_PREFIX = "community:barcode:";
const MAX_BARCODE_LEN = 64;
const MAX_NAME_LEN = 200;
const MAX_UNIT_LEN = 32;

function normalizeBarcode(raw: string): string | null {
  const trimmed = raw.trim().slice(0, MAX_BARCODE_LEN);
  return trimmed || null;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`community-lookup-get:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many lookups. Slow down a bit." }, { status: 429 });
  }

  const barcode = normalizeBarcode(req.nextUrl.searchParams.get("barcode") ?? "");
  if (!barcode) {
    return NextResponse.json({ error: "barcode is required." }, { status: 400 });
  }

  try {
    const redis = await getRedis();
    const raw = await redis.get(`${KEY_PREFIX}${barcode}`);
    const entry = raw ? JSON.parse(raw) : null;
    return NextResponse.json({ entry });
  } catch {
    // Redis being unreachable shouldn't break the lookup flow - callers
    // just fall back to the external UPC lookup / manual entry, same as if
    // the shared database simply had nothing for this barcode.
    return NextResponse.json({ entry: null });
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`community-lookup-post:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many contributions. Slow down a bit." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const barcode = normalizeBarcode(typeof body.barcode === "string" ? body.barcode : "");
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME_LEN) : "";
  const unit = typeof body.unit === "string" ? body.unit.trim().slice(0, MAX_UNIT_LEN) : "";

  if (!barcode || !name) {
    return NextResponse.json({ error: "barcode and name are required." }, { status: 400 });
  }

  try {
    const redis = await getRedis();
    // NX = only set if this barcode has never been contributed before -
    // see the file header for why that's the abuse defense here.
    const wasSet = await redis.set(`${KEY_PREFIX}${barcode}`, JSON.stringify({ name, unit: unit || "ea" }), {
      NX: true,
    });
    return NextResponse.json({ saved: wasSet === "OK" });
  } catch {
    return NextResponse.json({ saved: false });
  }
}
