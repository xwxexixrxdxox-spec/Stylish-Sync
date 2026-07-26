import Stripe from "stripe";
import { computeVisitCharge } from "./stripeTiers";
import { BookingRecord } from "./types";
import { billableHours } from "./booking";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://weirdsync.com";

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

// Creates a one-off Stripe Checkout Session for a single visit, billed at
// the server-computed rate for that booking's length (see
// stripeTiers.computeVisitCharge) - never lets whoever's paying pick the
// price themselves, unlike the old static, adjustable-quantity Payment
// Link this replaces. References only the two already-existing, already-
// live Prices (VISIT_HOURLY_PRICE_ID / VISIT_DAILY_PRICE_ID); doesn't
// create or modify any Stripe Product/Price/Payment Link.
export async function createVisitCheckoutSession(record: BookingRecord): Promise<{ url: string }> {
  const stripe = getStripe();
  // Charged off real clocked time, not the originally *scheduled* hours -
  // see billableHours' own comment for why (in short: a visit that ran
  // long or wrapped up early used to always bill the scheduled amount
  // regardless of how long it actually took).
  const charge = computeVisitCharge(billableHours(record));
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
      scheduledHours: String(record.hours),
      billedHours: String(billableHours(record)),
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout Session URL.");
  }
  return { url: session.url };
}
