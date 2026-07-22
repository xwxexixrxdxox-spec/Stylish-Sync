import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isRateLimited } from "@/lib/rateLimit";
import {
  PushDigest,
  getVapidKeys,
  parsePushRecord,
  subKeyForEndpoint,
} from "@/lib/pushServer";

// Opt-in reorder-reminder subscriptions — see pushServer.ts for the
// architecture overview and Redis key scheme.
//
//   GET    -> the VAPID public key the browser needs to subscribe
//   POST   -> create/replace a subscription record (with initial digest)
//   PUT    -> refresh just the digest for an existing subscription
//   DELETE -> remove a subscription (customer turned reminders off)

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// Caps applied to everything a client sends before it touches Redis — this
// is a public, unauthenticated route (like the community barcode routes),
// so nothing it stores should be attacker-inflatable.
const MAX_ITEMS_PER_LIST = 10;
const MAX_NAME_LENGTH = 80;

function sanitizeDigest(input: unknown): PushDigest | null {
  if (!input || typeof input !== "object") return null;
  const d = input as Partial<PushDigest>;
  const cleanName = (v: unknown) => String(v ?? "").slice(0, MAX_NAME_LENGTH);
  const cleanNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    lowStock: (Array.isArray(d.lowStock) ? d.lowStock : []).slice(0, MAX_ITEMS_PER_LIST).map((it) => ({
      name: cleanName(it?.name),
      quantity: cleanNum(it?.quantity),
      unit: cleanName(it?.unit).slice(0, 12),
      reorderAt: cleanNum(it?.reorderAt),
    })),
    highUsage: (Array.isArray(d.highUsage) ? d.highUsage : []).slice(0, MAX_ITEMS_PER_LIST).map((it) => ({
      name: cleanName(it?.name),
      quantity: cleanNum(it?.quantity),
      unit: cleanName(it?.unit).slice(0, 12),
      avgPerDay: cleanNum(it?.avgPerDay),
      daysLeft: cleanNum(it?.daysLeft),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const keys = await getVapidKeys();
  return NextResponse.json({ publicKey: keys.publicKey });
}

export async function POST(req: NextRequest) {
  if (isRateLimited(`push-sub:${clientKey(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const endpoint: string | undefined = body?.subscription?.endpoint;
  if (!endpoint || !body?.subscription?.keys?.p256dh || !body?.subscription?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  const redis = await getRedis();
  await redis.set(
    subKeyForEndpoint(endpoint),
    JSON.stringify({
      subscription: {
        endpoint,
        keys: { p256dh: String(body.subscription.keys.p256dh), auth: String(body.subscription.keys.auth) },
      },
      digest: sanitizeDigest(body.digest),
      createdAt: new Date().toISOString(),
      lastSentAt: null,
    })
  );
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  if (isRateLimited(`push-digest:${clientKey(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const endpoint: string | undefined = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  const redis = await getRedis();
  const key = subKeyForEndpoint(endpoint);
  const record = parsePushRecord(await redis.get(key));
  // Digest updates only refresh an existing opt-in — they never create one,
  // so an unsubscribed customer's data can't sneak back onto the server via
  // this route.
  if (!record) return NextResponse.json({ error: "Not subscribed" }, { status: 404 });
  record.digest = sanitizeDigest(body.digest);
  await redis.set(key, JSON.stringify(record));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const endpoint: string | undefined = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  const redis = await getRedis();
  await redis.del(subKeyForEndpoint(endpoint));
  return NextResponse.json({ ok: true });
}
