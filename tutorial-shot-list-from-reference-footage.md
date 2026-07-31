# Shot list for the tour rewrite — derived from the three reference videos

**Source:** `C:\AI\Output\WS_IM_Tutorial_Vids\Reference_TutorialPART{1,2,3}.mp4`
**Companion doc:** `tutorial-coverage-checklist.md` (what's covered, what isn't)
**Date:** 2026-07-31

---

## How to read this, and what the timecodes are worth

The footage was sampled one frame every four seconds, so **every timecode
below is accurate to ±4 s** — it points at the right moment, not the exact
frame. Trim points still need eyes on the video.

Two things this document is deliberately not:

- **It is not a transcript.** The videos have audio; this sandbox has no
  speech-to-text and none was installed without asking. Everything here is
  what is *visibly on screen*. No narration wording has been inferred from
  the recordings, and none should be.
- **It is not narration copy.** Narration text lives in
  `narration-scripts-tutorial-guide-rework.md` and
  `narration-scripts-new-tour-steps.md`. This document is the *staging plan* —
  which screen, in which state, with what already set up, pointing at which
  element.

Each shot lists: the source timecode, what the footage shows, the tour step
id it should drive (`—` means no step exists yet), and the app state that
has to be true before the shot works.

---

## PART 1 — the main app, end to end (4:48)

### Chapter: Getting started

**1.1 — Cold open on Inventory**
`P1 00:00–00:08` · step `welcome`, then `cookie-consent`
The app at rest: Import & export card, Share your barcode database card,
search field, "Recently changed" sort, "Estimated total inventory value
$129.50", two items (Premium Notebook A5 · 25 ea · Dry Stock, Ballpoint Pens
(blue) · 3 pack · Dry Stock · "Low stock"). The dark-mode tooltip is visible
top-right at 00:00.
*Pre-state:* seeded install, cookie banner still present.

**1.2 — Dark mode**
`P1 00:00` (tooltip "Switch to dark mode") · step `header-theme-toggle`
The footage only shows the tooltip, never the toggled state. **The rewrite
should actually toggle it** — a light/dark flip is the cheapest possible
"this app responds to me" moment and it currently happens off-camera.

**1.3 — Start Fresh, shown as the scary thing it is**
`P1 00:08` · step `start-fresh` (currently filed under Account)
Full-bleed black "DELETING ALL DATA — You will be logged out. Please log back
in to continue." This shot is far more legible than the small red link the
`start-fresh` step currently points at. Consider pointing the step at the
confirm dialog rather than the link.

**1.4 — Create your account**
`P1 00:12–00:16` · **no step exists**
Account panel showing "Create your account", Continue with Google, email +
password fields, Sign up, "Already have an account? Log in", Privacy Policy /
Terms of Service. This is the surface a genuinely signed-out first-time
visitor lands on, and the tour never mentions it — see the signed-out-visitor
mismatch in the coverage checklist.

### Chapter: Inventory

**1.5 — Import & export**
`P1 00:24` · step `inventory-import-export`
Import button in its highlighted/hover state, Export dropdown beside it, the
supporting line about Excel/JSON/CSV and usage history.

**1.6 — Share your barcode database**
`P1 00:28` · step `inventory-share-barcodes`
The card body highlighted, "Import & share" button beneath.
**Pair this with shot 1.14** — the payoff of sharing barcodes is the
auto-fill, and the two are currently 100 seconds apart with nothing linking
them.

**1.7 — Search narrows the list live**
`P1 00:32–00:36` · step `inventory-search-sort`
Typing `Ball` drops the list from two items to one and the estimated value
recalculates $129.50 → $6.00. **That recalculation is the shot** — it makes
search feel like a filter over real money, not a text box.

**1.8 — Sort dropdown**
`P1 00:40` · step `inventory-search-sort` (second half)
Dropdown open showing the sort options including "Recently changed" and a
low-stock ordering.

**1.9 — The row icons, named**
`P1 00:44` · step `item-action-icons`
Tooltip "Move to another location" visible on hover over the row icon strip.
*Pre-state:* an item with all four icons available.

**1.10 — Move stock between locations**
`P1 00:48–01:00` · **no step exists**
The Move dialog for Ballpoint Pens (blue): "How many to move?", "Move to
which location?" with a free-text hint (e.g. Front Fridge), Cancel / Move.
`P1 01:04` shows the result — the same SKU now appears twice, Dry Stock and
Office, and the total moves to $20.00.
This is a four-icon strip where three icons have steps and this one doesn't.

**1.11 — Break down a case**
step `item-action-breakdown`
**Not demonstrated anywhere in the footage.** The seed data now carries the
Spring Water case/each pair specifically so this step has something real to
point at — but there is no reference shot for it, so this one has to be
staged fresh rather than matched to the videos.

**1.12 — Edit the full details**
`P1 01:12–01:32` · step `item-action-edit`
The Edit item dialog end to end: Name, Barcode, Location, Quantity, Unit,
Price per unit, Reorder at, **"Break-down unit (optional)"** showing "Not a
case/pack — tracked as-is", and **"Track usage by (optional)"** with the
dropdown open over 7d / 14d / 30d / 90d / 1y / All. Delete (red, bottom-left)
and Save (bottom-right).
The two optional dropdowns are the substance here — they're the only place in
the app where a customer tells it how to think about a SKU.

**1.13 — Delete for good**
`P1 01:12+` (the red Delete inside the Edit dialog) · step `item-action-delete`
Worth noting the tour currently implies a row-level delete; the footage shows
it living inside Edit.

### Chapter: Scan

**1.14 — Two modes**
`P1 01:40–01:44` · step `scan-modes`
Receipt mode first ("Scan a Receipt", Take a Photo / Choose from Photos),
then Barcode mode (blue "Scan Barcode", "Trouble scanning? Take a photo
instead", and the manual-entry form beneath).

**1.15 — Live camera**
`P1 01:48` · step `scan`
Camera viewfinder with the scan line and "Cancel scan".
*Caveat:* the recording shows an OBS placeholder rather than a real camera
feed. A rebuilt shot needs a real barcode in frame.

**1.16 — Manual entry auto-fills from the shared database**
`P1 01:52–02:20` · **no step exists** — recommend a new one
Typing barcode `0001608002` into the manual field; the Item Description
populates itself with "Klean-Strip® Premium Stripper 16 Oz." and a
"✓ Product Name — select from menu" affordance appears.
**This is the single most persuasive twenty seconds in all three videos** and
the tour never shows it. It is also the payoff for shot 1.6.

**1.17 — Location, including inventing one**
`P1 02:24–02:36` · **no step exists**
Location dropdown open (Cooler / Dry Stock / Office), then the user types a
brand-new value — "Chemical Closet" — and it is accepted. Free-text locations
are a real feature that reads as a bug if nobody points it out.

**1.18 — Unit dropdown, then Add Stock**
`P1 02:40–02:44` · folds into `scan`
Long unit list (ea, box, case, pack, bag, bottle, can …), then the green
Add Stock / red Remove pair.

**1.19 — The result lands**
`P1 02:48` · closing beat of the Scan chapter
Inventory now carries Klean-Strip® at Chemical Closet, "Low stock", total
$162.97. Closing a chapter on visible consequence is worth the four seconds.

### Chapter: Reorder

**1.20 — The reorder list**
`P1 02:52` · step `reorder`
"Items to reorder", the Share button top-right, the flagged Klean-Strip row.

**1.21 — Choose where to buy**
`P1 03:20` and `03:28` · step `reorder-search-and-find`
"Find on ▾" dropdown open over the retailer list (Amazon, Walmart, Lowe's,
Home Depot, Costco, Sam's Club).

**1.22 — It really opens the retailer**
`P1 03:04–03:16` (Amazon results) and `P1 03:32` (Lowe's results)
Real search-result pages for the exact SKU.
**Use one, not both.** Two retailers back to back is where PART 1 sags, and
`P1 03:24` (an Amazon account-chooser overlay) is a stray that should be cut.

**1.23 — Tracking number**
`P1 02:52–03:00` · step `reorder-package-tracking`
The "Package tracking" field and "+ Add tracking number" beneath the row.

**1.24 — Share the list**
`P1 03:44` · step `reorder-share`
The OS share sheet.
*Caveat:* the footage shows the **Windows** share sheet. Most customers are
on a phone. This shot needs re-taking on mobile or the step reads as
desktop-only.

### Chapter: Usage

**1.25 — Import usage history**
`P1 03:48` · **no step exists**
"Import usage history" card with Import and Template buttons. The Template
button is the thing that makes importing tractable and nothing mentions it.

**1.26 — Sparkline overview**
`P1 03:48–03:56` · step `usage`
The per-item rows each with their own sparkline.

**1.27 — Timeframes**
`P1 04:00–04:12` · step `usage-detail-timeframes`
Item picker, the 7d/14d/30d/90d/1y/All row, and the three stat tiles
(used, avg/day, days remaining) updating with the selection.

**1.28 — Suggested reorder point, and Apply**
`P1 04:04–04:08` · **no step exists**
"Suggested reorder point — at ~0.2 pack/day, reordering around 2 pack gives
about a week of buffer. Currently set to 4." with an **Apply** button, and
at `04:12` the same panel reading "your current reorder point (2 pack)
already matches this pace."
**This is the app doing the customer's arithmetic for them and there is no
tour step for it.** If one gap on this list gets closed, make it this one.

### Chapter: Support

**1.29 — Clyde**
`P1 04:16–04:44` · step `support`
Clyde's opening message, the quick-reply chips (Barcode won't scan / Google
Sheet not syncing / Low stock + reorder numbers look wrong / Import + export
not working / In-store setup / Bonding question), a typed question
("Scanner not working"), the numbered answer, and the
**"That fixed it 👍 / Still stuck"** feedback pair at `04:28`.
The feedback pair is what makes Clyde feel accountable rather than
decorative; the current single step doesn't reach it.

---

## PART 2 — the Google Sheets path (2:07)

**2.1 — Choose an account**
`P2 00:00` · step `google-signin`
Google's "Choose an account to continue to weirdsync.com".

**2.2 — The unverified-app warning**
`P2 00:04` and `00:32` · step `google-signin` (second beat)
"Google hasn't verified this app … Continue / Back to safety".
**Do not cut this.** It is the moment a cautious customer abandons setup, and
the tour is the only place we can get ahead of it.

**2.3 — Consent screen**
`P2 00:36` · step `google-signin` (third beat)
"weirdsync.com wants access to your Google Account", the "already has some
access" note, Cancel / Continue.

**2.4 — Pick the spreadsheet**
`P2 00:40` · **no step exists**
The Google file picker showing four candidate "WS Inventory Man…" files.
Choosing the wrong one here is a silent, confusing failure.

**2.5 — The Account panel changes shape once linked**
`P2 00:44` · steps `account-push-test` / `account-pull-test`
Open My Google Sheet / Push to Sheet / Pull from Sheet / Re-authenticate
Google / Sign out / Start Fresh (clear sheet).
Note there are **two** Start Fresh variants — clear inventory (P2 00:08) and
clear sheet (P2 00:44). The tour only covers the local one.

**2.6 — Pull populates a real store**
`P2 00:52–01:00` · step `account-pull-test`
~28 grocery SKUs land (Spring Water 500ml · 48 bottles, Purified Drinking
Water, Little Debbie Oatmeal Creme Pies, Dr Pepper & Cream Soda, Kellogg's
Froot Loops w/ Marshmallows, Mott's Variety Pack, Pearl Milling Syrup, Mrs.
BUTTERWORTH'S Syrup, Act II popcorn, Plastic White Forks …) and the total
reads $124.47.
Going from empty to a full store in one button is the strongest argument for
Sheets in either video.

**2.7 — The sheet itself**
`P2 01:08–01:12` · **no step exists**
The linked spreadsheet with its three tabs — **Inventory / Usage / Property**
— and the Inventory columns (Barcode, Name, Quantity, Unit, Price Per Unit,
Reorder At, Location).

**2.8 — Attribution**
`P2 01:32–01:36` · step `account-name-tag`
"Last Edited By" reading **Claude QA** with "Last Edited At" timestamps down
the column. This is the concrete answer to *why do I type my name in*.

**2.9 — Edit here, push, see it there**
`P2 01:20–02:00` · step `account-push-test`
Quantity edited (total $124.47 → $4,975.47), an item deleted (→ $75.47),
Push to Sheet, and the sheet reflecting both.
A single round trip like this is worth more than any wording about syncing.

---

## PART 3 — Property tracking (3:38)

PART 3 is effectively a **complete second tour** — and it turns out one
already exists. `src/lib/propertyTutorial.ts` defines **16 steps** rendered by
`PropertyTutorialOverlay.tsx`, launched from "Take the property tour" on the
Manage Property screen, with its own audio folder `public/audio/property/`
(9 recordings). So the shot ids below split across two engines: the main tour
hands off at `account-manage-property`, and the property tour takes over from
there. See `tutorial-coverage-checklist.md` for the per-step mapping — and for
the reason this tour is currently in worse shape than the main one despite
being better covered on paper (it has no audio preflight, so its 7
unrecorded steps render as blank, silent screens).

**3.1 — Entry**
`P3 00:00` · step `account-manage-property` → hands off to `welcome-property`
The tutorial HUD reading "Let's look at Property tracking ✨" over the dimmed
app — this is the property tour's own `welcome-property` step, already shipped.

**3.2 — Manage Property at rest**
`P3 00:04–00:12`
Sync with Google Sheets block (Open My Google Sheet / Push to Sheet / Pull
from Sheet), "+ Add property", "Take the property tour", and the seeded
**Example: Rooftop HVAC Unit** (Building B Roof) with an Ordered part
(Condenser Fan Motor 1/4 HP, status dropdown, quantity steppers) and a
Maintenance/repair task ("Replace worn fan belt", status Needed).
The example card explicitly says it can be deleted once the customer has
their own — worth pointing out so nobody treats it as permanent furniture.

**3.3 — Add a property**
`P3 00:16–01:08`
The New property form: Name, Location (optional), Serial number (optional),
Notes (optional), Cancel / Add. Filled with **Washing Machine** / **Laundry
Room** / **N0T4R3ALNUMBER** / **Broken belt**.
*Staging note:* this takes ~50 s in the footage because it's typed live. A
tour step should pre-fill and let the customer type one field, not four.

**3.4 — The card appears**
`P3 01:12–01:20`
The new Washing Machine card in the list, with its own Edit / delete.

**3.5 — Add a part**
`P3 01:24–01:56`
"+ Add part": Part number (optional), Description, Unit, Price per unit,
Quantity ordered, Expected by (date), Add part. Description **GE Replacement
Belt**. The part then lists under Ordered parts with a status dropdown.

**3.6 — Source the part from a retailer**
`P3 02:00–02:08`
Walmart results for "ge replacement belt". Same pattern as Reorder's
"Find on" — worth making the parallel explicit so it's learned once.

**3.7 — Add a task**
`P3 02:12–02:28`
"+ Add task" and the typed task **"Repair the broken belt when replacement
arrives"**, appearing under Maintenance / repair tasks.

**3.8 — Walk the status, and watch history write itself**
`P3 02:32–02:56` · **the most important shot in PART 3**
The part's status dropdown moves Ordered → Shipped → Installed, and each
transition appends a green, timestamped, attributed line:
`Ordered — 7/30/2026 8:04:01 PM by Claude QA`, then `Shipped — …`, then
`Installed — …`.
**This settles an open design question:** status history already exists and
already records who and when. The Step List's ask to make history "much more
visible" is a presentation change, not new plumbing. The one genuinely
missing capability is **undoing** a status change.

**3.9 — Task statuses**
`P3 03:00–03:08`
Task dropdown open over Needed / Scheduled / In progress / Complete /
Cancelled, then set to In progress with its own green history line.

**3.10 — Push property to the sheet**
`P3 03:12–03:32`
Push to Sheet from Manage Property, then the sheet's **Property** tab with
both properties and the full column set (Property ID, Property Name,
Location, Serial Number, Notes, Last Edited By, Last Edited At, Part Number,
Description, Unit, Price Per Unit, Quantity Ordered, Quantity Received,
Estimated Delivery, Linked Task ID, Status).

**3.11 — Return**
`P3 03:36`
Back to Inventory. The recording ends on a filename card
("Screen Recording 2026-07-30 203552.mp4") which obviously gets cut.

---

## What the footage says about pacing

Three observations that only show up when you look at the whole thing at once:

**The videos spend their time in inverse proportion to how much the tour
covers.** PART 1 gives Scan roughly 70 seconds and the tour gives it two
steps; PART 3 spends 3:38 on Property and the tour gives it one. If the
rewrite is meant to mirror the reference, Property needs a chapter of its
own, not a signpost.

**Typing is where both drag.** The serial number in P3 takes about 25
seconds of real time to enter, and the Klean-Strip barcode about 20. Any
step rebuilt from these shots should arrive with the field already populated
and ask the customer for one gesture, not a full form.

**Every strong moment in the footage is a consequence, not a control.** The
value recalculating when search filters, the total jumping when a quantity is
edited, the green history line appearing on a status change, the store
filling up after Pull. The current tour is largely a tour of *buttons*. The
shots worth stealing are the ones where something visibly happens afterward.
