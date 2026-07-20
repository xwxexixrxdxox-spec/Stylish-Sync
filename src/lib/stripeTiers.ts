// WS Inventory Management itself (AI chat, Google Sheets sync, near-unlimited items,
// import/export, low-stock alerts) is free for everyone. The only paid
// offering is optional in-person labor: physically going to a customer's
// site and scanning/cataloging their inventory for them. Nothing is
// "installed" - the app is already free and available online, so there's
// no software setup fee here, just time on-site.
//
// There's no in-app checkout for this anymore - customers request a visit
// via the booking page (bookingUrl) and are billed afterward based on
// actual time worked, same "billed after the visit" posture as before.
// The corresponding Stripe Product/Prices (used for invoicing/payment
// links sent manually after a visit, not for on-site checkout) are:
//   Product: prod_UuY0UKJDIyMbUb ("In-Person Inventory Setup Visit")
//   Hourly price:  price_1TuiuHRs7xq2Oh7UjPEKngj6  ($30.00, per hour)
//   Daily price:   price_1Tuk9HRs7xq2Oh7UZG6RNfqW  ($300.00, per day, capped
//                  at 12hrs — see dailyRateBlurb below)
// The old $200/day price (price_1TuiuJRs7xq2Oh7U79AclUD9) was deactivated
// in Stripe rather than deleted, so past invoices/records referencing it
// still resolve correctly.
// Neither active price has a Stripe Tax registration behind it yet - no
// sales tax is currently being calculated/collected on these. See the
// sales-tax discussion in chat before turning that on.
//
// paymentLinkUrl used to be what the customer status page showed once the
// admin marked a visit "Finished" (see /admin/visits and
// /book_appointment/status) - a real, live Payment Link
// (plink_1TulZpRs7xq2Oh7Uh9BaN2vB) on the hourly price with an adjustable
// quantity (1-12), so the customer set their own hours (and therefore
// price) at checkout regardless of which rate was actually agreed on or
// how long the visit ran. It's kept below only as a historical/manual
// fallback (e.g. if Stripe Checkout is ever down) - real "Pay now" links
// now go through /api/book-appointment/checkout, which creates a
// per-booking Checkout Session at the server-computed rate below instead.
export const VISIT_OFFER = {
  hourlyRateLabel: "$30/hr",
  hourlyRateBlurb: "billed for time actually spent on-site",
  dailyRateLabel: "$300/day",
  dailyRateBlurb: "flat rate, capped at a total of 12hrs/day as required by law",
  bookingUrl: "/book_appointment",
  paymentLinkUrl: "https://buy.stripe.com/fZuaEZcsg5bpcOc6LH48008",
};

export const VISIT_HOURLY_PRICE_ID = "price_1TuiuHRs7xq2Oh7UjPEKngj6"; // $30.00/hr
export const VISIT_DAILY_PRICE_ID = "price_1Tuk9HRs7xq2Oh7UZG6RNfqW"; // $300.00/day flat
const HOURLY_RATE_CENTS = 3000;
const DAILY_RATE_CENTS = 30000;

export interface VisitCharge {
  amountCents: number;
  rateType: "hourly" | "daily";
  priceId: string;
  quantity: number;
  label: string;
}

// The single source of truth for what a visit of `hours` length actually
// costs - used both to create the real Stripe Checkout Session
// (stripeServer.ts) and to show the admin/customer the same number ahead
// of time, so there's no way for what's displayed and what's charged to
// drift apart the way the old adjustable-quantity Payment Link could.
//
// Rule: charge $30/hr, capped at the $300/day flat rate - i.e. whichever
// of the two already-existing, already-live Prices is cheaper for this
// booking's length. This needs no arbitrary "which bookings count as a
// full day" judgment call: every BOOKING_DURATIONS value of 10h or more
// hits the cap on its own (10 x $30 = $300), so the daily rate kicks in
// exactly where it's meant to, and a visit can never be charged more than
// the flat day rate.
export function computeVisitCharge(hours: number): VisitCharge {
  const hourlyTotalCents = Math.round(hours * HOURLY_RATE_CENTS);
  if (hourlyTotalCents >= DAILY_RATE_CENTS) {
    return {
      amountCents: DAILY_RATE_CENTS,
      rateType: "daily",
      priceId: VISIT_DAILY_PRICE_ID,
      quantity: 1,
      label: `$${(DAILY_RATE_CENTS / 100).toFixed(0)} (day rate)`,
    };
  }
  return {
    amountCents: hourlyTotalCents,
    rateType: "hourly",
    priceId: VISIT_HOURLY_PRICE_ID,
    quantity: hours,
    label: `$${(hourlyTotalCents / 100).toFixed(0)} (${hours}h @ $30/hr)`,
  };
}
