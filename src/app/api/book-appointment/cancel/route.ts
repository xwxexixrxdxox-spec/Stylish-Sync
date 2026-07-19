import { NextRequest, NextResponse } from "next/server";
import { cancelBooking } from "@/lib/booking";
import { sendOwnerCancellationNotice } from "@/lib/email";
import { isRateLimited } from "@/lib/rateLimit";

// Public — the id + cancelToken pair (from the confirmation email or the
// booking success screen) is what authorizes this, since customers never
// log in. See booking.ts's cancelBooking() for the token check itself.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`book-cancel:${ip}`, 10, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Slow down a bit." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const token = String(body.token ?? "");
  if (!id || !token) {
    return NextResponse.json({ ok: false, error: "Missing cancellation details." }, { status: 400 });
  }

  try {
    const result = await cancelBooking(id, token);
    if (result.ok && result.record) {
      await sendOwnerCancellationNotice(result.record);
    }
    return NextResponse.json({ ok: result.ok, error: result.error }, { status: result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Couldn't reach the booking system right now. Please try again shortly." },
      { status: 503 }
    );
  }
}
