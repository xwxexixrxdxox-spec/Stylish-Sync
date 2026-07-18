// WS Inventory Management itself (AI chat, Google Sheets sync, near-unlimited items,
// import/export, low-stock alerts) is free for everyone. The only paid
// offering is an optional one-time, in-person inventory setup: a
// technician physically scans and enters your stock on-site.
//
// Pricing is a flat installation fee (mobilization + setup) plus a
// per-day rate for however many days the on-site work actually takes.
// Both are real, live Stripe Payment Links (one-time prices, not
// subscriptions) - not placeholders.
//
// paymentLinkUrl (the flat fee) is the checkout button shown in the app;
// paying it reserves the install date. Its "After payment" redirect must
// be configured in the Stripe Dashboard to point at
// /payment-success?session_id={CHECKOUT_SESSION_ID} - see README
// "Configure Stripe redirect" section.
//
// dailyRatePaymentLinkUrl isn't wired into the checkout flow below - it's
// what gets sent to the customer after the technician's done and knows
// how many days the job actually took, same "billed after the visit"
// posture as the earlier hourly-rate design, just in day-sized units.
//
// TODO: schedulingUrl is a Calendly (or similar) event booking link shown
// after a successful install payment, so the customer can pick a visit
// date. Leave it empty until that's set up - the post-payment page falls
// back to a plain "we'll email you to schedule" message when it's unset.
export const INSTALLATION_OFFER = {
  paymentLinkUrl: "https://buy.stripe.com/4gM28tdwkavJeWk8TP48006",
  flatRateLabel: "$4,428.63",
  flatRateBlurb: "flat rate, reserves your install date",
  dailyRateLabel: "$125/day",
  dailyRateBlurb: "billed per day on-site, after the visit",
  dailyRatePaymentLinkUrl: "https://buy.stripe.com/fZueVf63SavJ5lK8TP48007",
  schedulingUrl: "",
};
