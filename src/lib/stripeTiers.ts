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
// paymentLinkUrl is what the customer status page shows once the admin
// marks a visit "Finished" (see /admin/visits and /book_appointment/status).
// It's a real, live Payment Link (plink_1TulZpRs7xq2Oh7Uh9BaN2vB) on the
// hourly price with an adjustable quantity (1-12) so the customer can set
// the actual hours worked at checkout — a placeholder in the sense that
// it always uses the hourly rate regardless of which rate was agreed on;
// swap this URL (or build real per-booking checkout) once billing needs
// to get more precise.
export const VISIT_OFFER = {
  hourlyRateLabel: "$30/hr",
  hourlyRateBlurb: "billed for time actually spent on-site",
  dailyRateLabel: "$300/day",
  dailyRateBlurb: "flat rate, capped at a total of 12hrs/day as required by law",
  bookingUrl: "/book_appointment",
  paymentLinkUrl: "https://buy.stripe.com/fZuaEZcsg5bpcOc6LH48008",
};
