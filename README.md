# WS Inventory Management

A Next.js inventory app for small businesses: barcode/receipt scanning,
low-stock reordering, usage tracking, two-way Google Sheets sync, and an
optional paid in-person setup visit. Repo/package name (`stylish-sync` /
`inventorysync-pro`) is a historical holdover from an earlier rebrand — the
product itself, everywhere a customer sees it (the app shell, emails,
`/manifest.json`), is called **WS Inventory Management**.

This is a real, live production app — it's deployed on Vercel and running at
[weirdsync.com](https://weirdsync.com) with real customers. This README
covers how to run it locally, what each environment variable does, and how
the paid on-site visit flow works, for whoever is maintaining or redeploying
it.

## What's included

- **Inventory** — search, +/- stock, edit, low-stock badges, and a visual
  cascading grouping for "break down into smaller units" parent/child items
  (e.g. a case broken into individual units)
- **Scan** — camera barcode scanning (ZXing) with manual-entry fallback,
  auto-fill product lookup (UPCitemdb by default, or your own provider), a
  crowdsourced barcode-name database (one customer's manual entry helps every
  other customer who scans the same barcode later), and receipt scanning
  (on-device OCR via tesseract.js) as a second way to add stock
- **Reorder** — auto list of low-stock items with native Share, and optional
  opt-in web push notifications (a daily digest of what's low, sent even
  while the app is closed)
- **Usage** — a chart of consumption/usage over a per-item custom tracking
  window, fed by every stock adjustment
- **Import/export** — Excel (.xlsx), CSV, plus two-way Google Sheets sync
  (including a Usage sheet with a native chart) with the customer's own
  Google account — nothing routes through the server; each customer's
  spreadsheet is their own
- **Free AI + rule-based support chat ("Clyde")** — open to everyone, no
  account or payment required. Backed by Ollama Cloud when `OLLAMA_API_KEY`
  is set, with a scripted rule-based assistant as an automatic fallback if
  that's unset or a call fails. There's no live human chat team behind it —
  if someone asks for a person, Clyde says so and points them at
  `SUPPORT_EMAIL` (see `src/lib/supportBot.ts`) or the paid in-person visit
  option below.
- **Optional paid on-site visit** — the only paid offering. A technician
  physically comes and sets up/audits a customer's inventory in person,
  billed after the fact for actual time spent ($30/hr, capped at a $300/day
  flat rate — see `src/lib/stripeTiers.ts`). This replaced the old
  subscription-tier model entirely; see "How the visit-booking + payment
  flow works" below.
- **Visit booking & lifecycle system** (`/book_appointment`) — public
  availability calendar, request submission with owner + customer email
  confirmations (Resend), a token-gated cancel link for the customer, an
  unguessable-but-shareable live status page, and a full admin-side
  lifecycle: availability editor, clock in / take a break / resume /
  finished, cancel, and a per-visit "Pay now" link generated only once the
  visit is marked finished
- **Admin panel** (`/admin`) — password-gated (see `ADMIN_PASSWORD` below),
  with a self-service "forgot password" flow that emails a reset link to
  `OWNER_NOTIFY_EMAIL`
- **Installable PWA** — manifest, service worker (offline app-shell
  fallback), install banner + manual "Install app" option in Account, icons,
  a hold-to-confirm "Clear Cache & Reload" control, and a walkthrough tour
  for first-time visitors
- **Cookie consent banner** — gates Google Analytics; declining (or not
  answering yet) means it never loads
- **Google Analytics** (optional) — consent-gated, IP-anonymized, ad
  features off
- **Privacy Policy / Terms of Service** pages, kept in sync with what the
  app actually does and collects (see Task 89's rewrite — no more
  `[bracketed placeholders]`)
- **Dev-only "simulate paid access" toggle** — a holdover from the old
  subscription model (see "Legacy: the old subscription flow" below);
  doesn't affect Support chat access anymore since that's free for everyone
  now, but still exercises the dormant `/api/check-access` code path for
  testing

## Quick start (local development)

```bash
npm install
cp .env.example .env.local   # fill in the values described below
npm run dev
```

Open http://localhost:3000.

Without any environment variables set, the app still runs: inventory,
scanning, import/export, and the rule-based (non-AI) fallback support chat
all work. Google Sheets sync, AI-backed chat, booking emails, push
notifications, and the admin panel only activate once you add the relevant
keys below.

## Environment variables

See `.env.example` for the full list with comments. Summary:

| Variable | Required for | Where to get it |
|---|---|---|
| `REDIS_URL` | Bookings, admin availability, crowdsourced barcode lookup, push subscriptions — most server-side state lives here | A Redis instance (e.g. Vercel's "Official Redis for Vercel" storage integration auto-injects this) |
| `ADMIN_PASSWORD` | Signing into `/admin` | Set your own — a plain password, not hashed, so pick one you don't reuse elsewhere |
| `OWNER_NOTIFY_EMAIL` | Where booking-request and admin-password-reset notifications go | Your own inbox address |
| `RESEND_API_KEY` | Sending any transactional email (booking confirmations, cancellations, visit-finished/payment prompts, admin password reset) | [Resend](https://resend.com) account → Settings → API Keys |
| `RESEND_FROM_EMAIL` | Optional — custom "from" address | Verify your own sending domain in Resend; defaults to Resend's shared test sender otherwise |
| `STRIPE_SECRET_KEY` | Creating/verifying Stripe Checkout Sessions for paid visits | Stripe Dashboard → Developers → API keys — **this account is livemode; real charges** |
| `STRIPE_WEBHOOK_SECRET` | Marking a visit "paid" when its Checkout Session completes | Stripe Dashboard → Developers → Webhooks → your endpoint's signing secret |
| `SESSION_SECRET` | Signing the legacy subscription session cookie (see "Legacy" below) and other signed-cookie use | `openssl rand -hex 32` |
| `OLLAMA_API_KEY` | AI-backed Clyde replies (Ollama Cloud) | [Ollama Cloud](https://ollama.com) account. Unset → Clyde falls back to the free rule-based assistant automatically |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Sheets sync sign-in | Google Cloud Console → Credentials → OAuth client ID |
| `NEXT_PUBLIC_GOOGLE_API_KEY` | Optional — lets customers pick an existing spreadsheet via a real Google Picker popup, instead of only ever getting an app-created one | Google Cloud Console → Credentials → API key, with the Google Picker API enabled |
| `NEXT_PUBLIC_UPC_LOOKUP_URL` | Optional — swap in a paid barcode-lookup provider | Your chosen provider; defaults to UPCitemdb's free trial endpoint |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional — Google Analytics (consent-gated) | Google Analytics → Admin → Data Streams |
| `NEXT_PUBLIC_SITE_URL` | Base URL used to build links in booking/status emails | Defaults to `https://weirdsync.com` if unset |
| `NEXT_PUBLIC_STRIPE_PORTAL_URL` | Legacy — "Manage billing" link for the old subscription model (see below) | Stripe Dashboard → Settings → Billing |
| `NEXT_PUBLIC_ENABLE_TEST_TOOLS` | Optional — shows the dev-only testing panel (simulate access, scan diagnostics) in a production-style local build. Never set in a real deployment | — |

VAPID keys for push notifications are generated automatically on first use
and persisted in Redis — no environment variable needed for those.

**Never commit `.env.local`.** Set these as environment variables in your
hosting provider's dashboard for production, not in code.

## How the visit-booking + payment flow works

The app itself (inventory, scanning, Sheets sync, Clyde support chat) is
free for everyone — there is no subscription anymore. The only paid offering
is an optional in-person setup visit:

1. A customer requests a time on `/book_appointment` (subject to the admin's
   configured availability). This sends owner + customer confirmation
   emails via Resend and does **not** charge anything yet.
2. The admin (via `/admin/visits`) clocks the technician in/out for the
   actual visit, including breaks. The visit's status (not started →
   clocked in → on break → finished, or cancelled by either side) is
   tracked throughout, and a public, unguessable-link status page
   (`/book_appointment/status?id=...`) lets the customer follow along —
   same "package tracking link" threat model as a shipping-carrier
   tracking page: the id alone is enough to view, but a separate token is
   required to cancel.
3. Once the admin marks the visit **Finished**, the app computes the real
   charge from actual clocked time (`billableHours` in `src/lib/booking.ts`)
   — rounded up to the next whole hour, capped at the $300/day flat rate —
   and emails the customer a "Pay now" link.
4. That link creates a fresh, server-priced Stripe Checkout Session for
   that specific booking (`/api/book-appointment/checkout` →
   `createVisitCheckoutSession` in `src/lib/stripeServer.ts`). The customer
   pays through Stripe's own hosted checkout; card data never touches this
   app's servers.
5. Stripe's webhook (`/api/stripe-webhook`, `checkout.session.completed`)
   marks the booking paid server-side — the customer's browser is never
   trusted to self-report that a payment went through.

**`VISITS_ENABLED` in `src/lib/stripeTiers.ts`** is a single kill switch —
when `false`, the booking page and API stop accepting new requests (the app
itself stays fully usable). Check its current value before assuming visits
are open; it's meant to be flipped back on once the admin/technician side
has had more real-world testing.

### Legacy: the old subscription flow

Earlier versions of this app sold a 4-tier Stripe subscription (1/3/6/12
months) that unlocked a gated support chat. That model is gone — support is
free for everyone now — but some of its plumbing is still present in the
codebase and shouldn't be treated as dead-and-safe-to-delete without
checking Stripe first:

- `/api/check-access`, `/api/verify-session`, `/payment-success`'s
  `"ok-subscription"` branch, and the "Restore access by email" /
  "Manage billing" bits in `AccountTab.tsx` all still work, but nothing in
  this repo currently creates a subscription-mode Checkout Session that
  would exercise them for a new customer.
- A legacy Stripe Payment Link (see the comment on `VISIT_OFFER
  .paymentLinkUrl` in `stripeTiers.ts`) may or may not still be configured
  in the live Stripe Dashboard to redirect to `/payment-success` — that
  can't be confirmed from the code alone, which is why this branch is
  documented rather than deleted.
- The dev-only "Simulate paid access" toggle (Account → testing tools, or
  `NEXT_PUBLIC_ENABLE_TEST_TOOLS=true`) still flips this legacy `access`
  flag for testing purposes, but it no longer gates anything customer-facing
  — Clyde and the rest of the app are free regardless of it.

## Google Sheets setup

1. In [Google Cloud Console](https://console.cloud.google.com), create (or
   reuse) a project, enable the **Google Sheets API**.
2. Credentials → Create Credentials → **OAuth client ID** → Application
   type: **Web application**.
3. Under "Authorized JavaScript origins," add your deployed URL(s), e.g.
   `https://weirdsync.com` (and `http://localhost:3000` for local dev).
4. Copy the Client ID into `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. This value is
   public and safe to ship to the browser — it's not a secret.
5. If the app isn't "verified" by Google, new users see an "unverified app"
   warning screen during sign-in until Google's verification process is
   completed (needed once you have real users beyond a small testing list).

Each customer connects their *own* Google account and *their own*
spreadsheet — nothing routes through the server.

### Optional: let customers pick an existing sheet

Without the steps below, "Sign in with Google" always creates a brand-new
spreadsheet, and "Import from sheet" only re-pulls from that same one —
there's no way to browse and choose one of the customer's *existing*
spreadsheets. To enable that (a real Google file-picker popup):

1. In the same Google Cloud project as above, go to Credentials → Create
   Credentials → **API key**. Restrict it to your deployed domain(s) if you
   want (optional but recommended).
2. APIs & Services → Library → search **Google Picker API** → Enable it.
3. Copy the API key into `NEXT_PUBLIC_GOOGLE_API_KEY`. Also public/safe to
   ship to the browser — it only grants Picker access, not account access.

Until this is set, the app works fine and just skips the picker (falls back
to the original single-sheet behavior) — this is an enhancement, not a
requirement.

## Admin panel

Sign in at `/admin` with `ADMIN_PASSWORD`. From there:

- **Availability** — set which days/hours are open for booking requests.
- **Visits** (`/admin/visits`) — see all requests, clock a technician
  in/out (with breaks), mark a visit finished (triggers the payment email),
  cancel a request, and see paid/unpaid status per visit.
- **Forgot password** — sends a single-use, 30-minute reset link to
  `OWNER_NOTIFY_EMAIL`. Requires both `OWNER_NOTIFY_EMAIL` and
  `RESEND_API_KEY` to be set.

## Deploying

The app is a standard Next.js 14 project, currently deployed on
[Vercel](https://vercel.com) at weirdsync.com, auto-deploying from the
`main` branch:

```bash
npm i -g vercel
vercel
```

Add all the environment variables above in Vercel's Project Settings, then
redeploy. Vercel's build & deploy status can be watched from the project's
Deployments tab.

## App Store / Play Store readiness

This is built as an **installable, store-ready PWA** rather than native
iOS/Android projects.

**Done:**
- Web app manifest + icons + `display: standalone` (installable via
  "Add to Home Screen" or the in-app install banner)
- Service worker for offline resilience (app-shell fallback on navigation
  failures; API routes and the payment flow are always fetched live, never
  cached)
- Privacy Policy and Terms of Service pages, reflecting the actual current
  app (visit booking, not subscriptions)
- No hidden fees — pricing is shown before any request is submitted
- Camera permission is requested only when scanning, with a clear purpose
- Cookie consent banner

**Before submitting to either store:**
1. Decide on a real refund policy for the paid visit service and confirm
   Terms reflects it — the current Terms describes a reasonable default,
   but it hasn't been reviewed by an actual lawyer.
2. If this should be listed as a native app (not just an installable web
   app), wrap it with a tool like [PWABuilder](https://www.pwabuilder.com)
   (Android via Trusted Web Activity — the easier path) or a
   Capacitor/Cordova shell (iOS requires this; Apple does not accept bare
   PWAs, per App Store Review Guideline 4.2). That requires an Apple
   Developer account ($99/yr) and Google Play Console account ($25
   one-time).
3. Both stores require a working support contact and a real, hosted privacy
   policy URL — this app has both, **except `support@weirdsync.com` is not
   yet a live mailbox** (see "Known limitations" below).
4. Google Play's Data Safety form and Apple's App Privacy "nutrition label"
   both ask you to disclose what the app collects — use the "What we
   collect" section of `/privacy` as the source of truth for those forms.

## Known limitations / things that need a human, not a code change

- **`support@weirdsync.com` is referenced throughout the app (Clyde,
  Terms, Privacy) as the contact address, but as of this writing nothing
  forwards mail sent there to a real inbox yet.** Setting up a forwarding
  alias (through whoever weirdsync.com's DNS is hosted with) pointed at a
  real inbox is a one-time setup step outside this codebase.
- **No live-agent backend.** Clyde tells customers plainly that there's no
  human chat team and points them at email or the paid in-person visit
  instead — there's no ticketing/chat backend wired up beyond that.
- **The old subscription Stripe plumbing is legacy, not deleted** — see
  "Legacy: the old subscription flow" above. Don't assume it's safe to
  remove without first confirming in the Stripe Dashboard whether the old
  Payment Link still points at it.
- **`VISITS_ENABLED`** (`src/lib/stripeTiers.ts`) may currently be `false`
  — check it before assuming new booking requests are being accepted.
- **`xlsx` (SheetJS) is pinned to the maintainer's own CDN build**
  (`https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`), not the npm
  registry — SheetJS stopped publishing security fixes to npm for this
  package, and the CDN build is their current patched one. Some sandboxed
  environments block that CDN domain, which will make `npm install` (and
  `next build`) fail against `xlsx` specifically; that's a network-policy
  issue in that environment, not a bug in this repo.
