export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-surface-muted px-4 py-10 sm:px-6">
      <div className="prose prose-neutral mx-auto max-w-2xl rounded-xl2 border border-surface-border bg-white p-6 shadow-card sm:p-8">
        <a href="/" className="mb-4 inline-block text-sm text-neutral-500 no-underline hover:text-neutral-900">
          ← Back to app
        </a>
        <h1>Privacy Policy</h1>
        <p className="text-sm text-neutral-500">
          Last updated: [DATE]. Replace the bracketed placeholders below with your business's real details before
          publishing — this page is a starting point, not legal advice.
        </p>

        <h2>Who we are</h2>
        <p>
          WS Inventory Management ("we", "us") is operated by [Your Company / Legal Name], [Business Address]. Contact us at{" "}
          [support@yourdomain.com] with any privacy questions.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Inventory data you enter</strong> (item names, barcodes, quantities, prices) — stored locally on
            your device, and optionally in a Google Sheet you own and control if you connect Google Sheets sync. We
            do not copy this data to our own servers.
          </li>
          <li>
            <strong>Camera access</strong> is used only to scan barcodes in the moment you tap "Scan Barcode." No
            photo or video is stored or transmitted; frames are processed on-device to read the barcode.
          </li>
          <li>
            <strong>Google account access</strong>, only if you choose to connect Google Sheets: we request the
            minimum "Sheets" scope needed to read/write the one spreadsheet you link. We never request access to
            your Gmail, Drive files in general, or contacts.
          </li>
          <li>
            <strong>Payment information</strong> is collected and processed entirely by Stripe when you subscribe.
            We never see or store your card number. We store only your Stripe customer ID and subscription status,
            used solely to confirm your subscription and unlock customer support.
          </li>
          <li>
            <strong>Support chat messages</strong> you send to the in-app assistant, used only to generate a
            response and, if you ask for a live agent, to hand off context to that agent.
          </li>
          <li>
            <strong>Essential cookies</strong> used to keep you signed in and to remember that you're a verified,
            paying subscriber so the support feature stays unlocked across visits.
          </li>
        </ul>

        <h2>What we don't do</h2>
        <ul>
          <li>We don't sell your data.</li>
          <li>We don't run third-party advertising trackers.</li>
          <li>We don't access your Google Sheet, Drive, or other files beyond the single linked spreadsheet.</li>
        </ul>

        <h2>Third parties we rely on</h2>
        <ul>
          <li>
            <strong>Stripe</strong> — payment processing. See{" "}
            <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">
              Stripe's Privacy Policy
            </a>
            .
          </li>
          <li>
            <strong>Google</strong> — optional Sheets sync, if you connect it. See{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
              Google's Privacy Policy
            </a>
            .
          </li>
        </ul>

        <h2>Your choices</h2>
        <ul>
          <li>
            <strong>Clear local data:</strong> use Account &gt; "Clear Cache &amp; Reload" to remove locally cached
            inventory data from this device.
          </li>
          <li>
            <strong>Disconnect Google:</strong> use Account &gt; "Sign out," or revoke access anytime from your{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
              Google Account permissions
            </a>{" "}
            page.
          </li>
          <li>
            <strong>Cancel your subscription:</strong> use the "Manage billing" link in Account, which opens
            Stripe's secure customer portal.
          </li>
          <li>
            <strong>Delete your data:</strong> email [support@yourdomain.com] and we will delete any data associated
            with your Stripe customer ID within 30 days. Because inventory data lives in your own Google Sheet and
            on your own device, you're also always free to delete it directly, without us.
          </li>
        </ul>

        <h2>Children</h2>
        <p>This app is not directed to children under 13, and we do not knowingly collect data from them.</p>

        <h2>Changes</h2>
        <p>We'll update the "Last updated" date above if this policy changes materially.</p>
      </div>
    </main>
  );
}
