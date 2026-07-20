import { NextRequest, NextResponse } from "next/server";
import { getBooking } from "@/lib/booking";
import { createVisitCheckoutSession } from "@/lib/stripeServer";
import { isRateLimited } from "@/lib/rateLimit";

// Public — gated only by knowing the (unguessable, UUID) booking id, same
// package-tracking threat model as /api/book-appointment/status. This is
// what the "Pay now" button (VisitStatusCard) and the visit-finished email
// point at now, replacing the old static Payment Link that let whoever
// clicked it set their own quantity/price. Creates a fresh, server-priced
// Checkout Session for this specific booking (see
// stripeTiers.computeVisitCharge) and redirects straight to it.
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`book-checkout:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Slow down a bit." }, { status: 429 });
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  try {
    const record = await getBooking(id);
    if (!record) return NextResponse.json({ error: "That visit couldn't be found." }, { status: 404 });

    const { url } = await createVisitCheckoutSession(record);
    return NextResponse.redirect(url, { status: 303 });
  } catch (e) {
    console.error("[book-appointment/checkout] failed", e);
    return NextResponse.json(
      { error: "Couldn't start checkout right now. Please try again shortly, or reply to your confirmation email." },
      { status: 503 }
    );
  }
}
