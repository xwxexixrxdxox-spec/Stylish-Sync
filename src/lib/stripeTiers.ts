// InventorySync itself (AI chat, Google Sheets sync, near-unlimited items,
// import/export, low-stock alerts) is free for everyone. The only paid
// offering is an optional one-time, in-person inventory setup: a
// technician physically scans and enters your stock on-site.
//
// This is a one-time Stripe Payment Link (not a subscription) for the
// booking/reservation fee. It must be configured in the Stripe Dashboard
// as a one-time price - see README "Configure Stripe redirect" section
// for the required "After payment" redirect setup
// (/payment-success?session_id={CHECKOUT_SESSION_ID}).
//
// TODO: paymentLinkUrl is a placeholder until a real one-time-price
// Payment Link is created in Stripe. Swap it in here once that exists.
//
// TODO: schedulingUrl is a Calendly (or similar) event booking link shown
// after a successful install payment, so the customer can pick a visit
// date. Leave it empty until that's set up - the post-payment page falls
// back to a plain "we'll email you to schedule" message when it's unset.
export const INSTALLATION_OFFER = {
  paymentLinkUrl: "https://buy.stripe.com/REPLACE_WITH_ONE_TIME_INSTALL_LINK",
  bookingFeeLabel: "$99",
  bookingFeeBlurb: "one-time, reserves your install date",
  hourlyRateLabel: "$45/hr",
  hourlyRateBlurb: "billed for actual time on-site, after the visit",
  schedulingUrl: "",
};
