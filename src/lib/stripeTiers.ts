// The four subscription tiers requested. Each maps to a pre-built Stripe
// Payment Link. Prices shown are informational copy only — the Payment
// Link itself (configured in the Stripe Dashboard) is the source of truth
// for what the customer is actually charged.
//
// IMPORTANT (see README "Configure Stripe redirect" section): for the
// "Stripe confirmation window should lead customers back to the web app"
// requirement to work, each Payment Link below must have its "After
// payment" behavior set to redirect to:
//   https://<your-deployed-domain>/payment-success?session_id={CHECKOUT_SESSION_ID}
// This is configured per-link in the Stripe Dashboard, not in this code.

export interface PricingTier {
  id: "1mo" | "3mo" | "6mo" | "12mo";
  label: string;
  billingPeriod: string;
  paymentLinkUrl: string;
  highlight?: boolean;
  blurb: string;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "1mo",
    label: "1 Month",
    billingPeriod: "billed monthly",
    paymentLinkUrl: "https://buy.stripe.com/7sYdRbboc47lcOc6LH48000",
    blurb: "Try it month to month.",
  },
  {
    id: "3mo",
    label: "3 Months",
    billingPeriod: "billed every 3 months",
    paymentLinkUrl: "https://buy.stripe.com/5kQ5kFeAocDRaG48TP48003",
    blurb: "A little breathing room.",
  },
  {
    id: "6mo",
    label: "6 Months",
    billingPeriod: "billed every 6 months",
    paymentLinkUrl: "https://buy.stripe.com/fZu6oJcsg9rF7tS2vr48002",
    highlight: true,
    blurb: "Most popular for growing stockrooms.",
  },
  {
    id: "12mo",
    label: "12 Months",
    billingPeriod: "billed yearly",
    paymentLinkUrl: "https://buy.stripe.com/28E7sNdwk8nBcOc7PL48001",
    blurb: "Best value, one payment a year.",
  },
];
