import { NextRequest, NextResponse } from "next/server";
import { findActiveSubscriptionByEmail } from "@/lib/stripeServer";
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";
import { isRateLimited } from "@/lib/rateLimit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "Sign in" for paid features, email-only, no password — Stripe is the
// source of truth for who's a subscriber, so we verify live against
// Stripe rather than maintaining our own account/password system. This
// is what lets a customer regain access on a new device, after clearing
// cookies, or after a checkout that completed without redirecting back
// to the app (e.g. a coupon/$0 order where the Stripe Payment Link's
// "after payment" redirect wasn't configured).
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`restore-access:${ip}`)) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const match = await findActiveSubscriptionByEmail(email);
    if (!match) {
      return NextResponse.json(
        { ok: false, error: "We couldn't find an active subscription for that email." },
        { status: 404 }
      );
    }

    const cookieValue = createSessionCookieValue({
      customerId: match.customerId,
      email,
      iat: Date.now(),
    });

    const res = NextResponse.json({ ok: true, plan: match.planNickname, currentPeriodEnd: match.currentPeriodEnd });
    res.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Couldn't verify that right now. Try again shortly." }, { status: 500 });
  }
}
