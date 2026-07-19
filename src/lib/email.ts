import { VISIT_OFFER } from "./stripeTiers";

// Thin wrapper around Resend's REST API (https://resend.com) for the
// transactional emails the booking flow sends: notifications to the
// business owner, and confirmation/status emails to the customer. Calls
// the HTTP API directly with fetch() rather than pulling in the `resend`
// npm package - one less dependency for something this small.
//
// Required env vars:
//   RESEND_API_KEY   - from your Resend account (Settings -> API Keys)
//   OWNER_NOTIFY_EMAIL - where booking-request notifications go
// Optional:
//   RESEND_FROM_EMAIL - defaults to Resend's shared test sender, which
//                        works immediately with no domain setup but has
//                        lower deliverability / sends "via resend.dev" -
//                        verify your own domain in Resend and set this once
//                        you want mail to come from your own address.
//   NEXT_PUBLIC_SITE_URL - base URL used to build cancel/status links in
//                        emails. Defaults to https://weirdsync.com.

const DEFAULT_FROM = "WS Inventory Management <onboarding@resend.dev>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://weirdsync.com";

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not set - skipping send.");
    return { ok: false, error: "Email isn't configured yet." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] Resend send failed", res.status, body);
      return { ok: false, error: "Couldn't send email right now." };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] Resend send threw", e);
    return { ok: false, error: "Couldn't send email right now." };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function visitLine(date: string, start: string, hours: number): string {
  return `${escapeHtml(date)} at ${escapeHtml(start)} (${hours} hour${hours === 1 ? "" : "s"})`;
}

export interface BookingEmailDetails {
  date: string;
  start: string;
  hours: number;
  name: string;
  email: string;
  phone: string;
  contactMethod: string;
  notes: string;
}

export async function sendOwnerNotification(details: BookingEmailDetails): Promise<void> {
  const ownerEmail = process.env.OWNER_NOTIFY_EMAIL;
  if (!ownerEmail) {
    console.error("[email] OWNER_NOTIFY_EMAIL is not set - owner will not be notified of this booking.");
    return;
  }
  const html = `
    <h2>New visit request</h2>
    <p><strong>${visitLine(details.date, details.start, details.hours)}</strong></p>
    <p><strong>Name:</strong> ${escapeHtml(details.name)}<br/>
    <strong>Email:</strong> ${escapeHtml(details.email)}<br/>
    <strong>Phone:</strong> ${escapeHtml(details.phone)}<br/>
    <strong>Preferred contact:</strong> ${escapeHtml(details.contactMethod)}</p>
    ${details.notes ? `<p><strong>Notes:</strong> ${escapeHtml(details.notes)}</p>` : ""}
    <p><a href="${SITE_URL}/admin/visits">Manage this request →</a></p>
  `;
  await sendEmail({ to: ownerEmail, subject: `New visit request — ${details.date} ${details.start}`, html });
}

// bookingId/cancelToken are optional only so this type can be reused
// loosely elsewhere — the booking route always has them by the time it
// calls this, since the booking was just created.
export interface CustomerConfirmationDetails extends BookingEmailDetails {
  bookingId: string;
  cancelToken: string;
}

export async function sendCustomerConfirmation(details: CustomerConfirmationDetails): Promise<void> {
  const cancelUrl = `${SITE_URL}/book_appointment/cancel?id=${encodeURIComponent(
    details.bookingId
  )}&token=${encodeURIComponent(details.cancelToken)}`;
  const statusUrl = `${SITE_URL}/book_appointment/status?id=${encodeURIComponent(details.bookingId)}`;

  const html = `
    <h2>You're requested for a visit</h2>
    <p>Thanks, ${escapeHtml(details.name)} — your request for <strong>${visitLine(
    details.date,
    details.start,
    details.hours
  )}</strong> has been received.</p>
    <p>This is a request, not a final confirmation — we'll reach out via your preferred contact method (${escapeHtml(
      details.contactMethod
    )}) to confirm the time. You'll be billed after the visit based on actual time spent, at ${
    VISIT_OFFER.hourlyRateLabel
  } (or ${VISIT_OFFER.dailyRateLabel} as an alternate flat rate).</p>
    <p><a href="${statusUrl}">Track your visit status →</a></p>
    <p><a href="${cancelUrl}">Cancel this request →</a></p>
  `;
  await sendEmail({ to: details.email, subject: "Your visit request — WS Inventory Management", html });
}

interface CancellationEmailDetails {
  date: string;
  start: string;
  hours: number;
  name: string;
  email: string;
}

// Customer cancelled their own request — let the owner know so they don't
// show up expecting a visit that's no longer happening.
export async function sendOwnerCancellationNotice(details: CancellationEmailDetails): Promise<void> {
  const ownerEmail = process.env.OWNER_NOTIFY_EMAIL;
  if (!ownerEmail) return;
  const html = `
    <h2>Visit request cancelled</h2>
    <p>${escapeHtml(details.name)} cancelled their request for <strong>${visitLine(
    details.date,
    details.start,
    details.hours
  )}</strong>.</p>
  `;
  await sendEmail({ to: ownerEmail, subject: `Cancelled — ${details.date} ${details.start}`, html });
}

// Owner cancelled a request from /admin/visits — let the customer know so
// they don't show up to an empty appointment.
export async function sendCustomerCancellationNotice(details: CancellationEmailDetails): Promise<void> {
  const html = `
    <h2>Your visit request was cancelled</h2>
    <p>Hi ${escapeHtml(details.name)} — your visit request for <strong>${visitLine(
    details.date,
    details.start,
    details.hours
  )}</strong> has been cancelled on our end. Reply to this email or reach out if you'd like to pick a new time.</p>
    <p><a href="${SITE_URL}${VISIT_OFFER.bookingUrl}">Request a new time →</a></p>
  `;
  await sendEmail({ to: details.email, subject: "Your visit request was cancelled", html });
}

// Sent the moment the admin marks a visit "Finished" from /admin/visits —
// this is the "prompt the customer to pay" step. Uses the shared
// adjustable-quantity Payment Link (VISIT_OFFER.paymentLinkUrl); the
// customer sets the correct number of hours at checkout.
export async function sendVisitFinishedEmail(details: CancellationEmailDetails): Promise<void> {
  const html = `
    <h2>Your visit is complete</h2>
    <p>Thanks, ${escapeHtml(details.name)}! Your visit on <strong>${visitLine(
    details.date,
    details.start,
    details.hours
  )}</strong> has been marked finished.</p>
    <p>You can pay for the visit here — set the number of hours at checkout:</p>
    <p><a href="${VISIT_OFFER.paymentLinkUrl}" style="display:inline-block;padding:10px 16px;background:#171717;color:#fff;border-radius:8px;text-decoration:none;">Pay now</a></p>
  `;
  await sendEmail({ to: details.email, subject: "Your visit is complete — payment", html });
}
