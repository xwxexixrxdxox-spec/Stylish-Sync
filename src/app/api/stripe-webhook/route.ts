import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripeServer";

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
    case "checkout.session.completed":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // Live subscription status is re-derived on demand in
      // /api/check-access, so no write is strictly required here.
      // Extend this switch if you add persisted records, receipts, etc.
      console.log(`[stripe-webhook] ${event.type}`);
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
