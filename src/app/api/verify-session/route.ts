import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripeServer";
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";

// Called when the customer lands back on the app after Stripe's own hosted
// payment confirmation page redirects them here with ?session_id=... .
// This is the ONLY place a "paid" cookie gets minted, and it only happens
// after we've asked Stripe directly (server-to-server, with our secret
// key) whether that checkout session actually completed. The customer's
// browser never gets a chance to just claim "I paid" — satisfies "the
// customer should not be able to confirm their own payment."
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing session_id." }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer"],
    });

    if (checkoutSession.payment_status !== "paid" && checkoutSession.status !== "complete") {
      return NextResponse.json({ ok: false, error: "Payment not completed." }, { status: 402 });
    }

    const customerId =
      typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : checkoutSession.customer?.id;

    if (!customerId) {
      return NextResponse.json({ ok: false, error: "No customer on this session." }, { status: 400 });
    }

    const cookieValue = createSessionCookieValue({
      customerId,
      email: checkoutSession.customer_details?.email ?? null,
      iat: Date.now(),
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "Verification failed." }, { status: 500 });
  }
}
