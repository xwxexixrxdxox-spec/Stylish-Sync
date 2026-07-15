export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-surface-muted px-4 py-10 sm:px-6">
      <div className="prose prose-neutral mx-auto max-w-2xl rounded-xl2 border border-surface-border bg-white p-6 shadow-card sm:p-8">
        <a href="/" className="mb-4 inline-block text-sm text-neutral-500 no-underline hover:text-neutral-900">
          ← Back to app
        </a>
        <h1>Terms of Service</h1>
        <p className="text-sm text-neutral-500">
          Last updated: [DATE]. Replace bracketed placeholders with your business's real details — this is a
          starting point, not legal advice.
        </p>

        <h2>1. The service</h2>
        <p>
          InventorySync ("the App") provides barcode inventory scanning, spreadsheet import/export, optional Google
          Sheets sync, and, for paying subscribers, customer support tools. The App is provided by [Your Company /
          Legal Name].
        </p>

        <h2>2. Subscriptions &amp; billing</h2>
        <ul>
          <li>Paid plans are billed in advance for the period you select (1, 3, 6, or 12 months) via Stripe.</li>
          <li>Subscriptions renew automatically at the end of each period unless cancelled beforehand.</li>
          <li>
            You can cancel anytime via the "Manage billing" link in Account; cancellation takes effect at the end of
            the current billing period.
          </li>
          <li>Refunds are handled at [Your Company]'s discretion — describe your refund policy here.</li>
        </ul>

        <h2>3. Customer support</h2>
        <p>
          The in-app support assistant is available to active subscribers only. It provides automated
          troubleshooting guidance; a live agent can be requested at any time and is available Monday–Friday,
          9am–5pm ([Your Timezone]). Outside those hours, messages are queued for the next business day.
        </p>

        <h2>4. Your data</h2>
        <p>
          Inventory data you enter stays on your device and, if you choose to connect it, in a Google Sheet that you
          own. See our <a href="/privacy">Privacy Policy</a> for details.
        </p>

        <h2>5. Acceptable use</h2>
        <p>
          Don't use the App to store unlawful content, attempt to disrupt the service, or circumvent the
          subscription/access controls described here.
        </p>

        <h2>6. Disclaimer &amp; liability</h2>
        <p>
          The App is provided "as is." Barcode lookups and stock calculations are best-effort and may occasionally
          be inaccurate — always verify critical inventory decisions independently. To the fullest extent permitted
          by law, [Your Company] is not liable for indirect or consequential damages arising from use of the App.
        </p>

        <h2>7. Changes</h2>
        <p>We may update these terms; continued use after an update means you accept the revised terms.</p>

        <h2>8. Contact</h2>
        <p>Questions about these terms: [support@yourdomain.com].</p>
      </div>
    </main>
  );
}
