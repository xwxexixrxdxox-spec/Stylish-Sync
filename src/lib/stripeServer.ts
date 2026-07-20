import Stripe from "stripe";
import { computeVisitCharge } from "./stripeTiers";
import { BookingRecord } from "./types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://weirdsync.com";

let _stripe: Stripe | null = null;

// Server-only. Never import this file from a client component.
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add your Stripe secret key (starts with sk_) to your environment variables. Never expose this key to the browser."
    );
  }
  _stripe = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
  });
  return _stripe;
}

// Checks whether a given Stripe customer currently has any active or
// trialing subscription. This is called fresh on every access check
// instead of trusting a cached "paid" flag, so an unlock automatically
// disappears if the customer cancels or a renewal payment fails.
export async function customerHasActiveSubscription(customerId: string): Promise<{
  active: boolean;
  planNickname: string | null;
  currentPeriodEnd: string | null;
}> {
  const stripe = getStripe();
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  const live = subs.data.find((s) => s.status === "active" || s.status === "trialing");
  if (!live) {
    return { active: false, planNickname: null, currentPeriodEnd: null };
  }
  const item = live.items.data[0];
  return {
    active: true,
    planNickname: item?.price?.nickname ?? item?.price?.id ?? null,
    currentPeriodEnd: new Date(live.current_period_end * 1000).toISOString(),
  };
}

// Looks up whether *any* Stripe customer registered under this email has
// an active/trialing subscription, and returns the first match. This is
// what powers "Restore access" (email-based sign-in for paid features):
// it doesn't depend on the customer having just come back from a Stripe
// Payment Link redirect, so it also covers customers who paid via a
// coupon/$0 checkout, switched devices/browsers, or cleared cookies.
//
// Note: Stripe's customer search by email can, in rare cases, return
// multiple customer records for the same email (e.g. if someone checked
// out twice with different names). We check each and return the first
// with an active subscription, which is the correct behavior for access
// purposes even if it's not a perfectly deduplicated "account."
export async function findActiveSubscriptionByEmail(email: string): Promise<{
  customerId: string;
  planNickname: string | null;
  currentPeriodEnd: string | null;
} | null> {
  const stripe = getStripe();
  const customers = await stripe.customers.list({ email, limit: 10 });

  for (const customer of customers.data) {
    const { active, planNickname, currentPeriodEnd } = await customerHasActiveSubscription(customer.id);
    if (active) {
      return { customerId: customer.id, planNickname, currentPeriodEnd };
    }
  }
  return null;
}

// Creates a one-off Stripe Checkout Session for a single visit, billed at
// the server-computed rate for that booking's length (see
// stripeTiers.computeVisitCharge) - never lets whoever's paying pick the
// price themselves, unlike the old static, adjustable-quantity Payment
// Link this replaces. References only the two already-existing, already-
// live Prices (VISIT_HOURLY_PRICE_ID / VISIT_DAILY_PRICE_ID); doesn't
// create or modify any Stripe Product/Price/Payment Link.
export async function createVisitCheckoutSession(record: BookingRecord): Promise<{ url: string }> {
  const stripe = getStripe();
  const charge = computeVisitCharge(record.hours);
  const statusUrl = `${SITE_URL}/book_appointment/status?id=${encodeURIComponent(record.id)}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: charge.priceId, quantity: charge.quantity }],
    success_url: statusUrl,
    cancel_url: statusUrl,
    customer_email: record.email || undefined,
    metadata: {
      bookingId: record.id,
      rateType: charge.rateType,
      hours: String(record.hours),
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout Session URL.");
  }
  return { url: session.url };
}
