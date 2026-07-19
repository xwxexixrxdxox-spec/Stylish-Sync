import { NextRequest, NextResponse } from "next/server";
import { getBooking, toPublicStatus } from "@/lib/booking";
import { isRateLimited } from "@/lib/rateLimit";

// Public — gated only by knowing the (unguessable, UUID) booking id, same
// threat model as a package-tracking link. Deliberately returns the
// stripped PublicBookingStatus view, not the full record (no email/phone/
// notes/cancelToken) — see PublicBookingStatus's comment in types.ts.
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`book-status:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Slow down a bit." }, { status: 429 });
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  try {
    const record = await getBooking(id);
    if (!record) return NextResponse.json({ error: "That visit couldn't be found." }, { status: 404 });
    return NextResponse.json({ status: toPublicStatus(record) });
  } catch {
    return NextResponse.json({ error: "Couldn't load status right now." }, { status: 503 });
  }
}
