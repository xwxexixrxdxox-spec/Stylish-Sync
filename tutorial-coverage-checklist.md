# Coverage checklist — every surface in the reference footage, tracked

**Companion doc:** `tutorial-shot-list-from-reference-footage.md` (which moment drives which step)
**Source footage:** `Reference_TutorialPART{1,2,3}.mp4`
**Repo state checked against:** `src/lib/tutorial.ts`, `src/lib/propertyTutorial.ts`,
`public/audio/tutorial/`, `public/audio/property/`
**Date:** 2026-07-31

---

## What this document is for

The shot list answers "where do I find footage for step X." This one answers
the opposite and more dangerous question: **"what did we film, or ship, that
nobody is going to notice is missing."**

Every row below is one surface that appears in the footage or one step that
exists in the code. Each carries a status:

- **Covered** — a step exists, it points at a real element, and its narration
  audio file exists on disk.
- **Silent** — a step exists and points at a real element, but there is no
  recorded audio for it. Because the tour deliberately renders no on-screen
  dialog, a silent step is a *blank* step. This is the most expensive status
  on the list.
- **Missing** — the surface is on camera and there is no step for it at all.
- **Blocked** — the shot itself is unusable and has to be re-taken before any
  step can be built on it.

Counts are stated so they can be checked rather than trusted.

---

## Correction to an earlier assumption

An earlier read of this project said the shipped tour represents the entire
Property surface with the single `account-manage-property` signpost. **That is
wrong and I should have checked before saying it.** There is a second, separate
tour — `src/lib/propertyTutorial.ts`, rendered by
`PropertyTutorialOverlay.tsx`, launched from "Take the property tour" on the
Manage Property screen. It has **16 steps** and its own audio folder,
`public/audio/property/`, with **9 recordings**.

So PART 3 is far better covered than I claimed. It also has a worse problem,
below.

---

## The two findings that matter most

### 1. The property tour had seven steps that were both blank and silent — FIXED, shipped in `0bc7475`

`TutorialOverlay.tsx` runs an audio preflight at tour start — a `HEAD` request
per step, dropping any step whose mp3 is absent. That is why the main tour
gracefully collapses from 32 authored steps to 12 playable ones instead of
sitting mute on 21 of them.

`PropertyTutorialOverlay.tsx` has **no such preflight**. Line 86 is simply
`const steps = PROPERTY_TUTORIAL_STEPS;` — all 16 run. Seven of them have no
mp3. And because the title and body render only inside a `sr-only`
`aria-live` region (line 353), a sighted user on one of those seven steps sees
a dimmed screen, a spotlight on some control, and **nothing else at all** —
no words, no voice, no explanation of why the screen went dark.

That is very likely a real part of what made the tour feel, in your words,
like the worst one you've ever tried to complete. The main tour's loop is
fixed; this is the same class of problem in the room next door.

The seven blank property steps were `property-sync-actions`, `add-property`,
`example-edit`, `example-status-dropdown`, `example-add-part`,
`example-add-task` and `replay-tour`.

**Shipped 2026-07-31 as `0bc7475`.** The preflight and the wrapper-component
pattern were ported across from `TutorialOverlay.tsx`: the step list resolves
before the inner overlay mounts (so the `[stepIndex]`-keyed effects start with
a stable array and step one still speaks), a network failure counts as
*present* rather than absent so one flaky request can't gut the tour, and an
all-absent result falls back to the full list. The "Finish tour" label is now
derived from position rather than read off `wrap-up`, since the step carrying
that label can now be dropped.

Sixteen steps became nine that actually talk. Verified: typecheck clean (one
pre-existing `xlsx` error only), production build clean, the emitted
`app/property/page-*.js` chunk contains the `{method:"HEAD"}` preflight and
its `catch → true` fallback, and the deployed server returns exactly 9 of the
16 clips. The live click-through is still outstanding — the Property page is
behind sign-in, and I'm not creating or signing into an account to reach it.

### 2. "Suggested reorder point … Apply" has no step in either tour

`P1 04:04–04:12`. The Usage detail screen computes a reorder point from real
consumption and offers a one-tap Apply, and at 4:12 it goes further and tells
you your current point already matches the pace. That is the app doing the
supply-chain thinking *for* the user — the single most defensible thing in
four minutes and forty-eight seconds of footage — and there is no step
pointing at it. `usage-detail-timeframes` stops at the timeframe buttons.

If only one gap on this whole list gets closed, close this one.

---

## Main tour — the 32 authored steps

Eleven have audio; twenty-one do not. Every selector below was confirmed to
exist in `src/` on 2026-07-31.

| # | Step id | Audio | Status | Note |
|---|---|---|---|---|
| 1 | `welcome` | ✅ | Covered | |
| 2 | `cookie-consent` | ✅ | Covered | |
| 3 | `header-theme-toggle` | ❌ | Silent | Footage shows only the tooltip, never the flip |
| 4 | `header-clear-cache-test` | ❌ | Silent | No reference shot |
| 5 | `stock-controls-tap` | ✅ | Covered | |
| 6 | `stock-controls-hold` | ✅ | Covered | |
| 7 | `inventory-search-sort` | ❌ | Silent | Good shot exists, `P1 00:32–00:40` |
| 8 | `inventory-import-export` | ❌ | Silent | `P1 00:24` |
| 9 | `inventory-share-barcodes` | ❌ | Silent | `P1 00:28` |
| 10 | `item-action-icons` | ❌ | Silent | `P1 00:44` |
| 11 | `item-action-breakdown` | ❌ | Silent | **No reference shot at all** — must be staged fresh |
| 12 | `item-action-edit` | ❌ | Silent | `P1 01:12–01:32` |
| 13 | `item-action-delete` | ❌ | Silent | Footage shows Delete inside the Edit dialog, not at row level — step and shot disagree |
| 14 | `scan` | ✅ | Covered | Camera view is an OBS placeholder, not a real feed |
| 15 | `scan-modes` | ❌ | Silent | `P1 01:40–01:44` |
| 16 | `reorder` | ✅ | Covered | |
| 17 | `reorder-search-and-find` | ❌ | Silent | `P1 03:04–03:20` |
| 18 | `reorder-package-tracking` | ❌ | Silent | `P1 02:52–03:00` |
| 19 | `reorder-share` | ❌ | Silent | Footage shows the **Windows** share sheet — re-take on mobile |
| 20 | `usage` | ✅ | Covered | |
| 21 | `usage-detail-timeframes` | ❌ | Silent | `P1 04:00–04:04` |
| 22 | `support` | ✅ | Covered | |
| 23 | `account-gear` | ✅ | Covered | |
| 24 | `google-signin` | ✅ | Covered | |
| 25 | `account-push-test` | ❌ | Silent | `P2 01:52–02:00` |
| 26 | `account-name-tag` | ❌ | Silent | `P2 00:08–00:16`; pays off at `P2 01:32` |
| 27 | `start-fresh` | ✅ | Covered | Points at the link; `P1 00:08` confirm screen is the stronger shot |
| 28 | `account-pull-test` | ❌ | Silent | `P2 00:52–01:00` |
| 29 | `account-manage-property` | ❌ | Silent | Hand-off into the property tour — worth recording early |
| 30 | `account-reminders-install` | ❌ | Silent | `P2 00:24` |
| 31 | `account-replay-tour` | ❌ | Silent | |
| 32 | `tour-complete` | ❌ | Exempt | Deliberately exempt from preflight so the tour always ends properly |

**11 covered · 20 silent · 1 exempt = 32.** The 20 silent steps are all
currently invisible to users, because the preflight drops them. They are
waiting on recordings, not on code.

---

## Property tour — the 16 authored steps

| # | Step id | Audio | Status | Reference |
|---|---|---|---|---|
| 1 | `welcome-property` | ✅ | Covered | `P3 00:00` |
| 2 | `property-sync-actions` | ❌ | **Blank & silent** | `P3 00:04–00:12` |
| 3 | `add-property` | ❌ | **Blank & silent** | `P3 00:16–00:20` |
| 4 | `example-property` | ✅ | Covered | `P3 00:04–00:12` |
| 5 | `health-rollup` | ✅ | Covered | |
| 6 | `example-edit` | ❌ | **Blank & silent** | `P3 01:12–01:20` |
| 7 | `ordered-part` | ✅ | Covered | `P3 01:52–01:56` |
| 8 | `log-receipt` | ✅ | Covered | |
| 9 | `example-status-dropdown` | ❌ | **Blank & silent** | `P3 02:32–02:56` |
| 10 | `eta-overdue` | ✅ | Covered | |
| 11 | `task-link` | ✅ | Covered | `P3 02:12–02:28` |
| 12 | `example-add-part` | ❌ | **Blank & silent** | `P3 01:24–01:48` |
| 13 | `status-history` | ✅ | Covered | `P3 02:32–03:08` |
| 14 | `example-add-task` | ❌ | **Blank & silent** | `P3 02:12–02:28` |
| 15 | `replay-tour` | ❌ | **Blank & silent** | |
| 16 | `wrap-up` | ✅ | Covered | |

**9 covered · 7 blank & silent = 16.**

---

## Surfaces on camera with no step in either tour

These are the true holes — nothing points at them, so nothing will remind
anyone they exist.

| Surface | Footage | Why it matters |
|---|---|---|
| **Suggested reorder point + Apply** | `P1 04:04–04:12` | See finding 2. The app's best moment. |
| **Barcode auto-fill from the shared database** | `P1 02:16–02:20` | Type ten digits, get "Klean-Strip® Premium Stripper 16 Oz." The most persuasive twenty seconds in all three videos. |
| **Move stock between locations** | `P1 00:44–01:08` | A whole dialog — "How many to move?", "Move to which location?" — and the same SKU splitting across Dry Stock and Office afterwards. A core multi-location workflow with zero coverage. |
| **Create your account / email + password** | `P1 00:12–00:16` | Also the surface behind the known signed-out-visitor mismatch in `account-gear` / `google-signin` / `start-fresh`. |
| **Typing a brand-new location inline** | `P1 02:32–02:36` | "Chemical Closet" typed straight into the field. Users assume locations are a fixed admin list. |
| **Unit dropdown** | `P1 02:40` | ea / box / case / pack / bag / bottle / can — the vocabulary the whole break-down feature rests on. |
| **Usage: Import history / Template** | `P1 03:48` | The on-ramp for a company arriving with existing data. |
| **Clyde's "That fixed it 👍 / Still stuck"** | `P1 04:28` | The support loop only closes if people press one. |
| **Spreadsheet picker** | `P2 00:40` | Four near-identical "WS Inventory Man…" candidates on screen — this is a place people will pick wrong. |
| **Re-authenticate Google / Sign out** | `P2 00:44` | The recovery path when sync breaks. |
| **Start Fresh (clear sheet)** | `P2 00:44` | The `start-fresh` step targets `[data-tutorial="start-fresh-local"]` — the local variant only. The sheet-clearing variant is the more destructive one and is uncovered. |
| **The Sheet's own tabs** | `P2 01:08–01:12` | Inventory and Property tabs, real column headers. Seeing their data in a spreadsheet they own is the thing that makes sync feel safe. |
| **"Last Edited By" attribution** | `P2 01:32–01:36` | "Claude QA" landing in the sheet — the payoff for `account-name-tag`, which is itself silent. |
| **Retailer results → cart** | `P3 02:00–02:08` | Walmart results for "ge replacement belt". `reorder-search-and-find` covers the Inventory-side version; the Property-side version is its own path. |

---

## Blocked shots — re-take before building on them

| Shot | Problem |
|---|---|
| `scan` camera view (`P1 01:48`) | OBS placeholder, not a live camera feed |
| `reorder-share` (`P1 03:44`) | Windows share sheet; needs a mobile re-take |
| Amazon account-chooser (`P1 03:24`) | Stray overlay, unrelated to the product — cut |
| Final frame (`P3 03:36`) | Ends on a "Screen Recording 2026-07-30 203552.mp4" filename card |
| `item-action-breakdown` | No footage exists at all |
| Serial-number typing (`P3 00:32–00:56`) | ~25 s of live typing; barcode entry (`P1 01:52–02:12`) is ~20 s. Both drag badly. Rebuilt steps should pre-fill and let the user watch the consequence. |

---

## The design question PART 3 settles

The Step List asked for status history to be "much more visible" and for an
undo affordance. The footage answers half of that for free: at
`P3 02:32–02:56` each status change — Ordered → Shipped → Installed — already
writes its own green, timestamped, attributed line
("Ordered — 7/30/2026 8:04:01 PM by Claude QA"). The history exists and it is
already good. Making it more visible is a **presentation** change, not new
plumbing.

The one genuinely missing capability is **undoing a status change**. There is
no undo-last-status control today — only "Reopen a closed row" in
`PropertyManager.tsx`. That is the piece that has to be built before the
hands-on Property rebuild can be filmed at all.

---

## Suggested order of work

1. ~~**Port the audio preflight into `PropertyTutorialOverlay.tsx`.**~~ Done —
   `0bc7475`, 2026-07-31. Seven blank screens gone without recording anything.
2. **Record the 20 silent main-tour steps and the 7 silent property steps.**
   Scripts already exist in `narration-scripts-tutorial-guide-rework.md` and
   `narration-scripts-new-tour-steps.md`.
3. **Add a step for Suggested reorder point + Apply.** New script needed.
4. **Add steps for barcode auto-fill and Move stock.** The two biggest
   uncovered workflows.
5. **Re-take the four blocked shots** and stage `item-action-breakdown` fresh.
6. **Build undo-a-status-change**, then rebuild the Property tour hands-on.

---

*Everything in this document was checked against the repo on 2026-07-31: every
step id above appears in `src/lib/tutorial.ts` or `src/lib/propertyTutorial.ts`,
every selector appears in `src/`, and every audio filename was confirmed
present or absent by listing `public/audio/tutorial/` and `public/audio/property/`.
No timecode was invented — each one traces to a labelled contact-sheet frame and
is accurate to ±4 s.*
