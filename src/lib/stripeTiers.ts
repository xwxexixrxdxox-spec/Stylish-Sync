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
//   Daily price:   price_1TuiuJRs7xq2Oh7U79AclUD9  ($200.00, per day)
// Neither has an active Stripe Tax registration behind it yet - no sales
// tax is currently being calculated/collected on these. See the sales-tax
// discussion in chat before turning that on.
export const VISIT_OFFER = {
  hourlyRateLabel: "$30/hr",
  hourlyRateBlurb: "billed for time actually spent on-site",
  dailyRateLabel: "$200/day",
  dailyRateBlurb: "alternate flat rate for a full day on-site",
  bookingUrl: "/book_appointment",
};
