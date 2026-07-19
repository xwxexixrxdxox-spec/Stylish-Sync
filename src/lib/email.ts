// Thin wrapper around Resend's REST API (https://resend.com) for the two
// transactional emails the booking flow sends: a notification to the
// business owner, and a confirmation to the customer. Calls the HTTP API
// directly with fetch() rather than pulling in the `resend` npm package -
// one less dependency for something this small.
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

const DEFAULT_FROM = "WS Inventory Management <onboarding@resend.dev>";

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
    <p><strong>${escapeHtml(details.date)} at ${escapeHtml(details.start)}</strong> (${details.hours} hour${
    details.hours === 1 ? "" : "s"
  })</p>
    <p><strong>Name:</strong> ${escapeHtml(details.name)}<br/>
    <strong>Email:</strong> ${escapeHtml(details.email)}<br/>
    <strong>Phone:</strong> ${escapeHtml(details.phone)}<br/>
    <strong>Preferred contact:</strong> ${escapeHtml(details.contactMethod)}</p>
    ${details.notes ? `<p><strong>Notes:</strong> ${escapeHtml(details.notes)}</p>` : ""}
  `;
  await sendEmail({ to: ownerEmail, subject: `New visit request — ${details.date} ${details.start}`, html });
}

export async function sendCustomerConfirmation(details: BookingEmailDetails): Promise<void> {
  const html = `
    <h2>You're requested for a visit</h2>
    <p>Thanks, ${escapeHtml(details.name)} — your request for <strong>${escapeHtml(details.date)} at ${escapeHtml(
    details.start
  )}</strong> (${details.hours} hour${details.hours === 1 ? "" : "s"}) has been received.</p>
    <p>This is a request, not a final confirmation — we'll reach out via your preferred contact method (${escapeHtml(
      details.contactMethod
    )}) to confirm the time. You'll be billed after the visit based on actual time spent, at $30/hr (or $200/day as an alternate flat rate).</p>
  `;
  await sendEmail({ to: details.email, subject: "Your visit request — WS Inventory Management", html });
}
