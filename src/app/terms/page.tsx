export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-surface-muted px-4 py-10 sm:px-6">
      <div className="prose prose-neutral mx-auto max-w-2xl rounded-xl2 border border-surface-border bg-white p-6 shadow-card sm:p-8">
        <a href="/" className="mb-4 inline-block text-sm text-neutral-500 no-underline hover:text-neutral-900">
          ← Back to app
        </a>
        <h1>Terms of Service</h1>
        <p className="text-sm text-neutral-500">Last updated: July 24, 2026.</p>

        <h2>1. The service</h2>
        <p>
          WS Inventory Management ("the App") is provided at{" "}
          <a href="https://weirdsync.com">weirdsync.com</a> and offers barcode and receipt-based inventory scanning,
          spreadsheet import/export, optional two-way Google Sheets sync, low-stock reorder tracking, and a free
          in-app support assistant. All of that is free to use — there is no subscription or account required. The
          only paid offering is the optional in-person setup visit described in Section 2.
        </p>

        <h2>2. On-site visits &amp; billing</h2>
        <ul>
          <li>
            A visit is a request, not a guaranteed booking — submitting one at{" "}
            <a href="/book_appointment">/book_appointment</a> asks us to confirm a time; we may follow up to adjust
            it based on real availability.
          </li>
          <li>
            You are billed after the visit, based on actual time spent on-site, at $30/hour, capped at a $300/day
            flat rate if a visit runs long — never more than the flat rate for a given day. The exact charge is shown
            to you before you pay, once the visit is marked finished.
          </li>
          <li>
            Payment is collected through a one-time Stripe Checkout link sent by email after the visit — we don't
            store or see your card details.
          </li>
          <li>
            You (or we) can cancel a pending request any time before the visit using the cancel link in your
            confirmation email, or by contacting us.
          </li>
          <li>
            Refunds for a completed, paid visit are handled case-by-case — contact us at the email in Section 8 if
            something about a charge seems wrong.
          </li>
        </ul>

        <h2>3. Customer support</h2>
        <p>
          The in-app support assistant ("Clyde") is free and available to anyone, with no sign-in or payment
          required. It answers with either an AI-backed reply or a scripted troubleshooting guide, depending on
          configuration, but either way it is automated — there is no live human chat team behind it. If you ask for
          a person, Clyde will say so plainly and point you to the email address in Section 8, or to the paid on-site
          visit in Section 2 if that's what you're actually after.
        </p>

        <h2>4. Your data</h2>
        <p>
          Inventory data you enter stays on your device and, if you choose to connect it, in a Google Sheet that you
          own. If you request an on-site visit, we collect and store the booking details you submit (name, email,
          phone, preferred contact method, notes, and the visit's own status/timing) so we can schedule, staff, and
          bill for it. See our <a href="/privacy">Privacy Policy</a> for the full details.
        </p>

        <h2>5. Acceptable use</h2>
        <p>
          Don't use the App to store unlawful content, attempt to disrupt the service, submit fraudulent or
          malicious booking requests, or interfere with other users' data.
        </p>

        <h2>6. Disclaimer &amp; liability</h2>
        <p>
          The App is provided "as is." Barcode lookups, receipt scanning, and stock calculations are best-effort and
          may occasionally be inaccurate — always verify critical inventory decisions independently. For on-site
          visits, we'll take reasonable care while on your premises, but to the fullest extent permitted by law we
          are not liable for indirect or consequential damages arising from use of the App or from an on-site visit,
          beyond directly correcting our own mistakes.
        </p>

        <h2>7. Changes</h2>
        <p>We may update these terms; continued use after an update means you accept the revised terms.</p>

        <h2>8. Contact</h2>
        <p>
          Questions about these terms, an on-site visit, or a charge:{" "}
          <a href="mailto:xwxexixrxdxox@gmail.com">xwxexixrxdxox@gmail.com</a>.
        </p>
      </div>
    </main>
  );
}
