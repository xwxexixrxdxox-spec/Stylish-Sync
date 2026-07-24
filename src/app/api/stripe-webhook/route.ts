import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripeServer";
import { markBookingPaid } from "@/lib/booking";

// Defense-in-depth alongside the live-check pattern used by
// /api/check-access: this endpoint verifies Stripe's webhook signature so
// only genuine Stripe events are trusted, and gives you a single place to
// hook up things like a receipt email, an internal Slack alert, or a
// database if you later want persisted subscription records instead of
// (or in addition to) live API checks.
//
// Configure this URL (https://<your-domain>/api/stripe-webhook) in Stripe
// Dashboard > Developers > Webhooks, subscribed to at least:
//   checkout.session.completed, customer.subscription.updated,
//   customer.subscription.deleted

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Invalid signature: ${err.message}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      // Previously this just logged - nothing anywhere ever recorded that
      // a visit got paid, so "Pay now" stayed live forever on a finished
      // visit and a customer could pay for the same visit twice with no
      // way for the app (or the admin) to notice. bookingId/rateType/
      // billedHours in metadata are set at session creation, in
      // createVisitCheckoutSession (stripeServer.ts) - only visit-payment
      // sessions carry a bookingId, so anything else (a subscription
      // checkout, if one's ever added back) is left alone here.
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.bookingId;
      if (bookingId) {
        const result = await markBookingPaid(bookingId, {
          stripeSessionId: session.id,
          amountCents: session.amount_total ?? 0,
        }).catch((e) => ({ ok: false as const, error: e?.message ?? String(e) }));
        if (!result.ok) {
          console.error(`[stripe-webhook] failed to mark booking ${bookingId} paid: ${result.error}`);
        }
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // Live subscription status is re-derived on demand in
      // /api/check-access, so no write is strictly required here.
      console.log(`[stripe-webhook] ${event.type}`);
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
