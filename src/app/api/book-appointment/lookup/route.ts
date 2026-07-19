import { NextRequest, NextResponse } from "next/server";
import { findActiveBookingForEmail } from "@/lib/booking";
import { isRateLimited } from "@/lib/rateLimit";

// Public — lets a customer find their own booking by the email they booked
// with (see findActiveBookingForEmail's comment on the trust boundary this
// implies). POST + JSON body rather than a GET + query param deliberately,
// so the email never ends up in a URL, server log line, or browser history.
// Only ever returns the booking id — never the full record — so this can't
// be used to pull a stranger's phone/notes/cancelToken just by guessing an
// email.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`book-lookup:${ip}`, 8, 5 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Slow down a bit." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Enter the email you booked with." }, { status: 400 });
  }

  try {
    const record = await findActiveBookingForEmail(email);
    if (!record) {
      return NextResponse.json({ ok: false, error: "No active booking found for that email." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id: record.id });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't look that up right now." }, { status: 503 });
  }
}
