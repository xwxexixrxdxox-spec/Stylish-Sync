export const metadata = { title: "Privacy Policy" };

// This page is part of the Google OAuth verification requirements for the
// Sheets sync feature: Google's review requires the privacy policy to be
// hosted on the app's own verified domain and to explicitly cover (1) with
// whom Google user data is shared/transferred/disclosed, (2) how sensitive
// data is protected, and (3) how long Google user data is retained and how
// it gets deleted — see the "Google user data" sections below. The Limited
// Use disclosure wording is required by the Google API Services User Data
// Policy and should not be reworded casually.
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-surface-muted px-4 py-10 sm:px-6">
      <div className="prose prose-neutral mx-auto max-w-2xl rounded-xl2 border border-surface-border bg-white p-6 shadow-card sm:p-8">
        <a href="/" className="mb-4 inline-block text-sm text-neutral-500 no-underline hover:text-neutral-900">
          ← Back to app
        </a>
        <h1>Privacy Policy</h1>
        <p className="text-sm text-neutral-500">Last updated: July 21, 2026</p>

        <h2>Who we are</h2>
        <p>
          WS Inventory Management ("we", "us") is the inventory management app operated at{" "}
          <a href="https://weirdsync.com">weirdsync.com</a>. Contact us at{" "}
          <a href="mailto:xwxexixrxdxox@gmail.com">xwxexixrxdxox@gmail.com</a> with any privacy questions or
          requests.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Inventory data you enter</strong> (item names, barcodes, quantities, prices, locations) — stored
            locally on your device, and optionally in a Google Sheet you own and control if you connect Google
            Sheets sync. We do not copy this data to our own servers, with one opt-in exception: reorder reminders,
            described next.
          </li>
          <li>
            <strong>A reorder-reminder summary, only if you turn on reminders</strong>: enabling daily reorder
            reminders stores a small summary on our server — the names, quantities, units, and usage rates of your
            low-stock and fastest-moving items (at most 20 items) — because reminder notifications have to be sent
            while the app is closed. It contains no barcodes, prices, or locations. Turning reminders off deletes
            it immediately.
          </li>
          <li>
            <strong>Camera access</strong> is used only to scan barcodes in the moment you tap "Scan Barcode." No
            photo or video is stored or transmitted; frames are processed on-device to read the barcode.
          </li>
          <li>
            <strong>Google account access</strong>, only if you choose to connect Google Sheets. We request three
            permissions: <em>Google Sheets</em> (read/write the spreadsheet you link, so the app can sync your
            inventory and usage history to it), <em>Drive file access</em> (limited to files you pick in the file
            picker or that the app creates for you — never your Drive as a whole), and <em>your email address</em>{" "}
            (shown so you know which account is connected, and used to match an existing service booking if you
            have one). We never request access to your Gmail, contacts, or the rest of your Drive.
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

        <h2>How we use Google user data</h2>
        <p>
          Google Sheets sync exists for exactly one purpose: keeping a spreadsheet you own in sync with the
          inventory on your device. When you press "Push to Sheet" the app writes your inventory and usage history
          into your linked spreadsheet; when you press "Pull from Sheet" it reads them back. All of this happens
          directly between your browser and Google's servers — your spreadsheet contents and your Google access
          token are never sent to or stored on our servers.
        </p>
        <p>
          WS Inventory Management's use of information received from Google APIs will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2>Sharing, transfer, and disclosure of Google user data</h2>
        <ul>
          <li>
            <strong>We do not share, transfer, sell, or disclose your Google user data to anyone.</strong> Not to
            advertisers, not to data brokers, not to analytics providers, not to other users.
          </li>
          <li>
            Your spreadsheet data moves only between your own device and your own Google account. It never passes
            through, and is never stored on, our servers — so there is nothing on our side to share.
          </li>
          <li>
            We do not use Google user data for advertising, for training machine-learning models, or for any
            purpose other than the sync feature described above.
          </li>
          <li>
            The only circumstance in which we would disclose any user data is if we were legally compelled to by a
            valid legal process — and because Google user data is never on our servers, in practice there would be
            nothing to produce.
          </li>
        </ul>

        <h2>How we protect your data</h2>
        <ul>
          <li>
            <strong>Encryption in transit:</strong> all connections to weirdsync.com and to Google's APIs use
            HTTPS/TLS.
          </li>
          <li>
            <strong>No server-side copies:</strong> your inventory and spreadsheet data live only on your device
            and in your Google account. Our servers store no copy — except the small opt-in reorder-reminder
            summary described above, if you've enabled reminders — which means a breach of our infrastructure
            cannot expose your Google user data.
          </li>
          <li>
            <strong>Access tokens stay in your browser:</strong> the Google access token issued when you sign in is
            held in your browser session only, is short-lived, and is never transmitted to our servers or written
            to our infrastructure.
          </li>
          <li>
            <strong>Least privilege:</strong> we request the narrowest Google permissions that make the feature
            work — per-file Drive access rather than full Drive access, and Sheets access only for the spreadsheet
            you link.
          </li>
          <li>
            <strong>Payment isolation:</strong> card details go directly to Stripe, a PCI-DSS Level 1 certified
            processor; they never touch our systems.
          </li>
        </ul>

        <h2>Retention and deletion of Google user data</h2>
        <ul>
          <li>
            <strong>On our servers: nothing is retained</strong>, because nothing is stored there in the first
            place. There is no server-side copy of your spreadsheet data or Google account data to delete.
          </li>
          <li>
            <strong>On your device:</strong> the app keeps a local copy of your inventory, your linked
            spreadsheet's ID, and sync bookkeeping for as long as you use the app on that device. You can erase all
            of it at any time with the header's "Clear Cache &amp; Reload" button or Account &gt; "Start Fresh
            (clear inventory)" — deletion is immediate.
          </li>
          <li>
            <strong>Access tokens</strong> expire automatically (typically within an hour) and are discarded;
            signing out discards the connection immediately.
          </li>
          <li>
            <strong>In your Google account:</strong> your spreadsheet is yours — deleting it in Google Drive, or
            revoking the app's access from your{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
              Google Account permissions
            </a>{" "}
            page, removes our access permanently and instantly.
          </li>
          <li>
            <strong>Reorder-reminder summaries</strong> (if you enabled reminders) are kept only while reminders
            are on: turning them off in Account settings deletes the stored summary immediately, and a summary
            that stops being refreshed (you haven't opened the app in two weeks) stops being used for
            notifications.
          </li>
          <li>
            <strong>On request:</strong> email{" "}
            <a href="mailto:xwxexixrxdxox@gmail.com">xwxexixrxdxox@gmail.com</a> and we will delete any data we do
            hold about you (your Stripe customer ID, subscription status, and any reminder summary) within 30
            days.
          </li>
        </ul>

        <h2>What we don't do</h2>
        <ul>
          <li>We don't sell your data.</li>
          <li>We don't run third-party advertising trackers.</li>
          <li>We don't access your Google Sheets or Drive files beyond the spreadsheet you link or pick.</li>
        </ul>

        <h2>Third parties we rely on</h2>
        <ul>
          <li>
            <strong>Stripe</strong> — payment processing. See{" "}
            <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">
              Stripe's Privacy Policy
            </a>
            . Stripe receives your payment details; it never receives your inventory or Google user data.
          </li>
          <li>
            <strong>Google</strong> — optional Sheets sync, if you connect it. See{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
              Google's Privacy Policy
            </a>
            . Google is the storage provider for your own spreadsheet; we do not transfer your data to Google — you
            sync it into your own account.
          </li>
          <li>
            <strong>Vercel</strong> — hosts this website. Vercel serves the app's code and, like any web host, sees
            standard request logs (IP address, pages requested); it does not receive your inventory or Google user
            data, which never leave your device except to sync with your own Google account.
          </li>
        </ul>

        <h2>Your choices</h2>
        <ul>
          <li>
            <strong>Clear local data:</strong> hold the refresh icon in the header ("Clear Cache &amp; Reload"), or
            use Account &gt; "Start Fresh (clear inventory)," to remove locally stored inventory data from this
            device.
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
            <strong>Delete your data:</strong> email{" "}
            <a href="mailto:xwxexixrxdxox@gmail.com">xwxexixrxdxox@gmail.com</a> and we will delete any data
            associated with your Stripe customer ID within 30 days. Because inventory data lives in your own Google
            Sheet and on your own device, you're also always free to delete it directly, without us.
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
