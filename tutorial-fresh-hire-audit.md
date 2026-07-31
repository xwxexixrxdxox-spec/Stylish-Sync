# Tutorial audit — fresh-hire walkthrough

Live run on weirdsync.com, all 32 steps of the main tour, start to finish, in one
sitting. I did it in character: a new hire straight out of high school, first day,
no inventory-software background, nobody sitting next to them, told only "take the
tour." No reading the source first, no guessing at what a step *meant* to do — only
what the screen actually showed.

Test conditions: 1920×1080 desktop, cookie consent and tutorial-completed flags
cleared so it behaved like a first visit. Real inventory data left untouched; every
localStorage key was backed up before and restored after. I did not press Start
Fresh (step 27) — it would have wiped real data — so that step was evaluated by
design rather than by execution.

---

## 1. The loop — reproduced, twice

You were right, and it's worse than one loop. The "Previous step" arrow is a trap
at every step that follows a self-resolving step, and there are three of those.

**Confirmed instance A — step 3.** Counter reads 3/32. Press Previous. It goes to
2/32 (the cookie banner step) and within a quarter of a second snaps back to 3/32.
Press it again: same. The counter visibly flickers 3 → 2 → 3. I pressed it four
times in a row and never got past step 3.

**Confirmed instance B — step 21.** This is almost certainly the one you hit,
because it sits right in the middle of the tour where you'd naturally want to go
back and re-hear something. Tap into the Usage item as the step asks, land on
21/32, press Previous — you go to 20/32 and are bounced straight back to 21/32.
Three presses, three bounces. From step 21 onward the back arrow is permanently
dead.

**Latent instance C — step 15.** Same mechanism on the scan step. It didn't fire
for me only because I never completed a real barcode scan. A customer who does
scan something will hit it.

**Why it happens.** Three steps advance themselves when you do the real thing:
cookie-consent (when you pick Accept or Decline), scan (when a lookup resolves),
and usage (when the detail view opens). Their "have you done it yet?" check re-runs
the instant the step is entered — including when it's entered *backwards* — and by
then the answer is permanently yes. Cookies stay accepted. The detail view stays
open. So the step immediately fires "done, move forward" and throws you back where
you came from.

The guard that's supposed to stop double-advancing gets cleared before those checks
run, so it can't help. This is a mechanical certainty, not a race — it will happen
to every customer, every time, on the same steps.

**Fix.** The self-resolve checks need to know which direction the customer arrived
from and stay quiet when it was backwards. Concretely: track the previous index,
and skip the satisfaction check entirely when the new index is lower than the old
one. A step you've already satisfied should sit still and let you listen to it
again — that's the entire point of a back button.

---

## 2. The bigger problem: 21 of 32 steps say nothing at all

This is, I think, the actual reason the tour was miserable rather than merely rough.

Since we removed on-screen dialog cards, the recorded voice clip is the *only*
guidance a customer gets. I checked all 32 audio files on the live site. Eleven
exist. Twenty-one return 404:

```
header-theme-toggle          item-action-delete           account-push-test
header-clear-cache-test      scan-modes                   account-name-tag
inventory-search-sort        reorder-search-and-find      account-pull-test
inventory-import-export      reorder-package-tracking     account-manage-property
inventory-share-barcodes     reorder-share                account-reminders-install
item-action-icons            usage-detail-timeframes      account-replay-tour
item-action-breakdown                                     tour-complete
item-action-edit
```

So for two thirds of the tour, a fresh hire sees the screen go dark, one thing glow
amber, and hears silence. Nothing tells them what the glowing thing is, what it
does, or why they should care. Several of those silent steps *ask them to perform
an action* — step 4 wants them to press-and-hold the refresh icon — with no way on
earth to know that.

That's on me. I shipped an engine whose only voice channel was empty for 21 steps
and verified the mechanics rather than the experience. Two things should change:

- Record the 21 missing clips (scripts already written and delivered).
- More importantly, make the engine refuse to show a step it cannot narrate.
  Preflight the audio at tour start, drop any step with a missing file from the
  list, and renumber. A short tour that talks is infinitely better than a long one
  that doesn't. This also means a future missing file degrades quietly instead of
  producing another silent wall.

---

## 3. Three steps are visually broken

Steps 11 (break down a case), 25 (Push to Sheet), and 28 (Pull from Sheet) have no
element to point at — the breakdown icon only renders for items with a case/each
relationship, and Push/Pull only render when Google Sheets is connected. When the
target is missing, the overlay doesn't degrade to a plain full-screen dim. It draws
**a single grey rectangle covering roughly the top-left two-thirds of the page**,
with a hard edge across the middle of the screen and the rest of the app left
bright and clickable.

I screenshotted step 11. It doesn't look like a tutorial step. It looks like the
app crashed mid-render. Combined with the silence, a new hire's honest read is
"I broke it."

**Fix, in order of value:**

1. Skip a step whose target selector matches nothing. Same preflight as the audio —
   filter at tour start, renumber, never show it.
2. For 25/28 specifically, also gate on whether a sheet is connected, so a customer
   who skipped Google sign-in never meets a Push/Pull step at all. Same for 24.
3. As a backstop, when a target is genuinely absent mid-tour, fall back to a clean
   full-viewport dim rather than a partial rectangle.
4. Separately: give the three sample items a case/each pair so step 11 has
   something real to demonstrate. I offered this last round; it's a small
   `SEED_ITEMS` change and it's the difference between a feature being taught and
   being invisible.

---

## 4. The dim overlay itself is visibly seamed

The dim is built from up to eight-plus rectangular bands tiled around the spotlight
hole, and each band applies its own blur. Where two bands abut, the blur doubles
along the seam and you get a bright line. On a typical step this reads as a
full-height and full-width cross drawn through the page, plus extra lines wherever
a second highlighted region is in play. On the Reorder share step I counted four
visible seam lines.

Band counts across the tour were also wildly inconsistent: 0, 1, 3, 8, 13, 17. Step
16 rendered **zero** bands — no dim at all, just a glow floating on a fully-lit
page. Step 19 rendered 17.

**Fix.** Stop tiling. One full-viewport element with a single backdrop-filter, and
punch the hole with `clip-path` (an evenodd path, outer rect plus each spotlight
rect) or an SVG mask. One filter, one surface, no seams, and the band count stops
mattering. This also fixes step 16's missing dim for free.

---

## 5. Smaller things, in the order a fresh hire meets them

**Nothing tells you the tour exists.** It doesn't open on a first visit. The only
way in is a small compass icon in the header that a new hire has no reason to read
as "guided tour." Suggest: a one-time dismissible chip on first load — "New here?
Take the 5-minute tour" — that never comes back once dismissed or completed.

**Step 1 is a black screen and a number.** The welcome step dims everything, points
at nothing, and the single piece of information on screen is "1/32." Thirty-two is
a daunting number to open with, and it's the first thing they read. Suggest: show
elapsed-style progress ("about 5 minutes") rather than a raw count, or drop the
counter on step 1 entirely, and give the welcome step the app logo as its spotlight
so it points at *something*.

**The counter never explains itself.** 32 steps with no chapter structure feels
endless. Suggest grouping — "Inventory 3 of 9", "Account 2 of 8" — so the customer
can see the end of the current section rather than the end of everything.

**Practice steps highlight too much.** Step 5 says "tap minus or plus" but the
spotlight is a 470-pixel-wide strip covering the whole quantity row. The two
buttons it means are 32 pixels each. Suggest spotlighting the two buttons as two
small holes rather than the row.

**The Usage demo has no data.** Step 20 spotlights an item whose card reads "No
usage last 30d," while the voice line promises charts of how fast things move and
days-of-stock-left estimates. The tour's own example disproves the pitch. Suggest
seeding a few weeks of synthetic usage events on one sample item so the chart
actually draws.

**Sidebar steps point off-screen for about two seconds.** When the tour opens the
Account panel, the spotlight is measured while the panel is still sliding in — I
measured a hole at x=1949 on a 1920-wide viewport, i.e. entirely off the right edge,
which then corrected to x=1589 about two seconds later. Suggest waiting for the
panel's transition to end (or a couple of animation frames past it) before
measuring.

**The ending just stops.** Tapping Finish at 32/32 makes the overlay vanish, and it
leaves the customer sitting inside the Account settings sidebar — the last place the
tour navigated to, not anywhere they'd want to start working. No confirmation, no
"you're set." Suggest closing the sidebar, returning to the Inventory tab, and
showing a brief non-blocking confirmation with the two obvious next actions (add
your first item / import a spreadsheet).

**Step 32 points at the same button as step 29.** Both spotlight "Manage Property."
The closing line — "that's the tour" — shouldn't be attached to a control at all.

**A stray punctuation bug in the narration text.** The accessible text renders as
"That's the tour!. You're all set" — a title ending in "!" gets a "." appended. A
screen reader or any TTS pass over that string says the doubled stop. Worth
trimming trailing punctuation before joining title and body.

**Signed-out customers get three meaningless steps.** 24 (Google sign-in), 25
(Push) and 28 (Pull) all assume a connected sheet. Covered by the gating in §3, but
worth calling out as a single coherent gap rather than three separate ones.

---

## 6. What the tour genuinely does well

I want to be fair about this, because the bones are good and I don't think any of
the above requires starting over.

**Driving the real app beats a slideshow.** The tour switches real tabs, opens the
real sidebar, and cuts a real hole in the dim so the customer touches the actual
control. Nothing is a screenshot or a mock. When a step has a voice and a target,
it is genuinely clear and it teaches muscle memory rather than trivia. This is the
right architecture and it's worth protecting.

**The self-resolving steps feel alive.** Accepting the cookie banner, opening the
account gear, tapping into a Usage item — the tour notices and moves on by itself.
It reads as attentive rather than scripted. (The loop is a bug in this feature, not
an argument against it.)

**Separating "read this" from "try this" was the right call.** The amber "Move on"
pill on the two stock-adjustment steps, instead of a chevron, correctly signals
"there's no rush, play with it." Extending that treatment to more hands-on steps
would be an improvement, not a retreat.

**Keeping context lit around the spotlight.** On the Reorder steps, the whole item
card stays bright while one control glows. That's better than a bare hole — the
customer can see what the control belongs to.

**The HUD stays out of the way.** Draggable to any corner, Skip always reachable,
mute always reachable. Nothing is trapped behind it.

**The step order is sound.** Inventory → Scan → Reorder → Usage → Support → Account
matches how someone would actually adopt the app: get stock in, keep it accurate,
notice what's low, understand the pattern, then set up sync. Nobody would need to
re-sequence this.

**The scripts themselves read well.** Plain language, no jargon, honest caveats
(receipt-scan accuracy, package tracking being a notepad rather than a live
tracker). The writing is not the problem — its absence is.

---

## 7. What I'd do next, ranked

1. **Direction-aware self-resolve** — kills the loop. Small, contained change.
2. **Preflight-and-drop steps with missing audio or missing targets** — turns
   twenty-one silent steps and three broken ones into a shorter tour that works,
   today, before a single clip is recorded.
3. **Record the 21 missing clips** — restores the tour to full length.
4. **Single-element mask with clip-path** — removes the seams and the band-count
   inconsistency in one go.
5. **Seed data: case/each pair, and synthetic usage history** — makes steps 11 and
   20 demonstrate something real.
6. **Entry point and exit** — a first-visit invitation, and an ending that returns
   the customer to Inventory with a confirmation.
7. **Chaptered progress instead of "n/32."**

Items 1 and 2 together would have prevented the run you had. I should have caught
them by doing exactly what I just did — one uninterrupted pass as a customer —
rather than testing each mechanism in isolation and inferring the whole worked.
