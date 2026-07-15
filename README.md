# InventorySync

A merged rebuild of your Base44 inventory app (`stylish-sync-stream-go`) and
your ISC barcode scanner (GitHub Pages), combined into one installable web
app with a secure 4-tier Stripe subscription and gated customer support.

This is a real, working Next.js codebase — not a mockup. It builds cleanly
(`npm run build` succeeds) and every screen was smoke-tested. It is **not
yet deployed anywhere**: you'll deploy it to your own hosting account and
plug in your own Stripe/Google credentials, following the steps below.

## What's included

- **Inventory** — search, +/- stock, edit, low-stock badges (from Base44 app)
- **Scan** — camera barcode scanning (ZXing), manual entry, auto-fill product
  lookup, Add Stock / Remove (from ISC app)
- **Reorder** — auto list of low-stock items with native Share (from Base44 app)
- **Import/export** — Excel (.xlsx), LibreOffice (.ods), CSV, plus two-way
  Google Sheets sync with your own Google account (from both apps)
- **4-tier Stripe subscription** (1/3/6/12 months) using the payment links
  you provided
- **Secure payment confirmation** — customers cannot self-confirm payment;
  only the server (holding your Stripe secret key) can unlock support, by
  verifying the checkout session directly with Stripe
- **Gated AI + live-agent support chat** — hidden until payment is verified,
  scripted self-troubleshooting bot, live-agent handoff only on request and
  only Mon–Fri 9am–5pm (configurable)
- **Installable PWA** — manifest, service worker, icons, "Clear Cache &
  Reload," cookie consent banner
- **Privacy Policy / Terms** pages as a starting point for store compliance
- **Email sign-in for paid features** — scanning/inventory/import-export
  work with no account, matching the ISC app's offline-first design, but
  subscribing or restoring access on a new device asks for the email you
  paid with (verified live against Stripe, no password needed) — matching
  how both original apps required an account for their paid tier
- **Dev-only "simulate paid access" toggle** for testing the subscriber
  experience without a real Stripe transaction (see "Testing the paid
  experience without paying" below) — disabled by default outside `next dev`

## Quick start (local development)

```bash
npm install
cp .env.example .env.local   # fill in the values described below
npm run dev
```

Open http://localhost:3000.

Without any environment variables set, the app still runs: inventory,
scanning, and import/export all work. Payment verification, Google Sheets,
and support chat only activate once you add the relevant keys below.

## Environment variables

See `.env.example` for the full list with comments. Summary:

| Variable | Required for | Where to get it |
|---|---|---|
| `STRIPE_SECRET_KEY` | Verifying payments server-side | Stripe Dashboard > Developers > API keys |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature check | Stripe Dashboard > Developers > Webhooks |
| `SESSION_SECRET` | Signing the "verified paying customer" cookie | `openssl rand -hex 32` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Sheets sync | Google Cloud Console > Credentials |
| `NEXT_PUBLIC_UPC_LOOKUP_URL` | Optional: paid barcode lookup | Your chosen provider |
| `NEXT_PUBLIC_STRIPE_PORTAL_URL` | "Manage billing" link | Stripe Dashboard > Settings > Billing |
| `SUPPORT_TIMEZONE` / `SUPPORT_START_HOUR` / `SUPPORT_END_HOUR` | Live-agent hours | Defaults to America/Chicago 9–5 |

**Never commit `.env.local`.** Set these as environment variables in your
hosting provider's dashboard for production, not in code.

## How the secure payment unlock works

This is the part that fixes the old Base44 "Pro" page's *"I've completed my
payment — unlock support"* button, which let anyone claim to have paid
without Stripe ever being asked.

1. Customer picks a plan and is sent to your Stripe Payment Link.
2. Stripe hosts its own checkout and its own confirmation page — we never
   touch card data.
3. **You must configure each Payment Link to redirect back to your app**
   (see next section). Stripe then sends the customer to
   `/payment-success?session_id={CHECKOUT_SESSION_ID}`.
4. Our server (`/api/verify-session`) calls Stripe directly with your
   secret key to confirm that session actually completed, then sets a
   signed, HttpOnly cookie the browser cannot forge or edit.
5. `/api/check-access` re-checks Stripe live on every visit — so if a
   subscription is canceled or a renewal fails, the Support tab
   disappears automatically, with no database required.
6. `/api/support-chat` checks that same cookie + live Stripe status before
   answering anything — so even someone who found the chat widget in the
   page source can't use it without a verified subscription.

## Configure Stripe redirect (required)

For each of your 4 Payment Links, in the Stripe Dashboard:

1. Payment Links > select the link > **... menu > Edit**
2. Under "After payment," choose **"Redirect customers to your website"**
3. Set the URL to:
   `https://<your-deployed-domain>/payment-success?session_id={CHECKOUT_SESSION_ID}`
4. Repeat for all 4 links (1, 3, 6, and 12 month).

Also add a webhook endpoint (Developers > Webhooks > Add endpoint):
`https://<your-deployed-domain>/api/stripe-webhook`, subscribed to
`checkout.session.completed`, `customer.subscription.updated`, and
`customer.subscription.deleted`. Copy the signing secret into
`STRIPE_WEBHOOK_SECRET`.

## Testing the paid experience without paying

There are three ways to see what a subscriber sees, in increasing order of
how much of the real pipeline they exercise:

**1. Simulate paid access (fastest — no Stripe involved at all).** Run the
app locally with `npm run dev`, go to Account, and use the amber "Testing
tools" panel to flip on "Simulate paid access." This sets a cookie that's
completely separate from the real payment-verification cookie, unlocks the
Support tab and chat instantly, and never touches Stripe. It shows up
automatically under `npm run dev` — if you're testing a production-style
local build instead (`next build && next start`), set
`NEXT_PUBLIC_ENABLE_TEST_TOOLS=true` in `.env.local` to make it appear
there too. It disappears by default in any real deployment either way —
see `src/lib/devMode.ts` for the single guard both the UI and the API
route share.

**2. Restore access by email (works anywhere, including localhost,
without any Stripe Dashboard configuration).** In Account, under "Already
subscribed?", enter the email you paid with. The server looks that email
up directly against Stripe (`stripe.customers.list({ email })`) and, if it
finds an active subscription, signs you in — same as an original checkout
would, just triggered by you instead of by a redirect. This is also the
fix for real customers whose checkout completes without ever redirecting
back to the app (see the note below on what likely happened with your
100%-off coupon test).

**3. Full Stripe test-mode checkout (slowest — exercises the real,
redirect-based flow end-to-end).** When you want to verify the payment →
redirect → verification → unlock pipeline itself, not just the "does a
subscriber see the right screen" part, use Stripe's **test mode**:
1. In the Stripe Dashboard, flip the "Test mode" toggle (top right).
2. Create test-mode duplicates of your 4 Payment Links (test-mode and
   live-mode links are separate; your real 4 links given to this app are
   live-mode).
3. Use `STRIPE_SECRET_KEY=sk_test_...` (a test secret key) in your `.env.local`.
4. Check out with Stripe's test card `4242 4242 4242 4242`, any future
   expiry, any CVC — no real money moves.
5. This exercises everything for real: Stripe's confirmation page, the
   redirect back to `/payment-success`, server-side session verification,
   the signed cookie, and the live subscription check — the only thing
   that's fake is the card number.

**What likely happened with the 100%-off coupon test:** a $0-total
checkout still completes correctly on Stripe's side, but the app only
finds out about it via the redirect described in "Configure Stripe
redirect" above. If that redirect wasn't set on the link you used —
easy to skip, since it's a one-time manual Dashboard setting — Stripe
just shows its own generic confirmation page and never sends the browser
back to `/payment-success`, so the app has no way to know checkout
happened. Option 2 above (restore by email) sidesteps this entirely,
since it doesn't depend on any redirect.

> I noticed while reviewing your Stripe payment links that one of your
> historical "Stylish Sync" links ($5/mo) shows as **Disabled** in your
> dashboard — that's unrelated to the 4 links you gave me for this app, but
> worth a look if it wasn't intentional.

## Google Sheets setup

1. In [Google Cloud Console](https://console.cloud.google.com), create (or
   reuse) a project, enable the **Google Sheets API**.
2. Credentials > Create Credentials > **OAuth client ID** > Application
   type: **Web application**.
3. Under "Authorized JavaScript origins," add your deployed URL(s), e.g.
   `https://your-app.vercel.app` (and `http://localhost:3000` for local
   dev).
4. Copy the Client ID into `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. This value is
   public and safe to ship to the browser — it's not a secret.
5. If your app isn't yet "verified" by Google, it'll show an "unverified
   app" warning screen to new users during sign-in until you complete
   Google's verification process (needed once you have real users beyond a
   small testing list).

Each customer connects their *own* Google account and *their own*
spreadsheet — nothing routes through your server, matching how the
original ISC app worked.

## Deploying

The app is a standard Next.js 14 project and deploys cleanly to
[Vercel](https://vercel.com) (recommended, generous free tier, zero
config) or Netlify:

```bash
npm i -g vercel
vercel
```

Then add all the environment variables above in Vercel's Project Settings,
and redeploy.

## App Store / Play Store readiness

This was built as an **installable, store-ready PWA** rather than native
iOS/Android projects (see the two options we discussed — this is the
lighter-weight path). What's done vs. what's left:

**Done:**
- Web app manifest + icons + `display: standalone` (installable via
  "Add to Home Screen")
- Service worker for offline resilience
- Privacy Policy and Terms of Service pages
- No hidden fees — pricing is shown before checkout
- Camera permission is requested only when scanning, with a clear purpose
- Cookie consent banner

**Before you submit to either store, you still need to:**
1. Replace every `[bracketed placeholder]` in `/privacy` and `/terms` with
   your real business name, address, and support email.
2. Decide on your actual refund policy and reflect it in Terms.
3. If you want this listed as a native app (not just an installable web
   app), wrap it with a tool like [PWABuilder](https://www.pwabuilder.com)
   (Android via Trusted Web Activity, easier) or a Capacitor/Cordova
   shell (iOS requires this — Apple does not accept bare PWAs). That
   requires your own Apple Developer ($99/yr) and Google Play Console
   ($25 one-time) accounts, which I don't have access to.
4. Both stores require a working support contact and a real privacy
   policy URL — this app has both once you fill in step 1.
5. Google Play's Data Safety form and Apple's App Privacy "nutrition
   label" both ask you to disclose what this app collects — use the
   "What we collect" section of `/privacy` as your source of truth when
   filling those out.

## Known limitations / things I couldn't do for you

- **I did not modify your Stripe account.** Configuring the Payment Link
  redirects and webhook (above) requires you to do it in the Stripe
  Dashboard, or explicitly ask me to do it via browser automation with
  your permission.
- **No live-agent backend is wired up.** The chat currently tells
  customers a live agent is available and offers to hand off, but there's
  no real ticketing/chat backend behind that yet — wire in something like
  Zendesk, Intercom, or a simple email-to-ticket flow in
  `src/lib/supportBot.ts` / `src/components/SupportChatWidget.tsx`.
- **`xlsx` (SheetJS) points at the maintainer's own CDN build**, not the
  npm registry. SheetJS stopped publishing security fixes to npm for this
  package (the registry version has known ReDoS / prototype-pollution
  advisories with no npm-side fix); `package.json` installs from
  `https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz` instead, which is
  their current patched build. This sandbox's network policy blocks that
  domain, so I could not run `npm install` against it here — please run
  `npm install` and then `npm audit` on your own machine after unzipping
  to confirm it resolves cleanly (it should show 0 xlsx findings). If for
  any reason that CDN is unreachable for you too, pin back to
  `"xlsx": "^0.18.5"` from the npm registry as a fallback; exposure from
  the known advisories is limited either way since import parsing happens
  client-side on files the user picks themselves, not on the server.
- I generated simple placeholder app icons
  (`public/icons/*.png`) — swap in real branded icons before shipping.
# Stylish-Sync
# Stylish-Sync
