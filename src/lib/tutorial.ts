"use client";

import type { TabId } from "@/components/BottomNav";

// The new-customer walkthrough that replaced the old "just some demo items
// nobody explains" first-open experience. Each step names the tab/sidebar
// state it needs and (optionally) a CSS selector to spotlight - see
// TutorialOverlay.tsx for how these get driven and rendered. Kept as a
// flat, ordered list rather than a tree/graph: every customer sees the same
// tour in the same order, so there's nothing branchy to model here.
//
// Fourth-generation content (round "O"): a full rewrite from the
// customer's own step-by-step "Tutorial Guide" doc, on top of the
// third-generation engine changes shipped alongside it (draggable HUD,
// back arrow, no more auto-advance-on-audio-end - see TutorialOverlay.tsx's
// top comment). The doc covers what it calls "Part 1" and "Part 2" of the
// tour - both folded into this one TUTORIAL_STEPS list, since Part 2 (the
// Account section: menu, Google Sheets push/pull, Start Fresh) is still
// the same single continuous walkthrough as Part 1, just its back half.
// "Part 3" (a from-scratch, hands-on rework of the Property tour) is a
// separate, larger undertaking not included in this round - see
// propertyTutorial.ts's own comment.
export interface TutorialStep {
  id: string;
  // Which section of the tour this step belongs to, shown in the HUD as
  // e.g. "Inventory 3/9". A bare "1/32" was the first thing a customer read
  // on the opening step, and thirty-two is a daunting number to lead with -
  // a chapter shows them the end of the section they're actually in.
  // TutorialOverlay counts positions over the steps that survived its
  // narration preflight, so these stay correct even when steps get dropped.
  chapter?: string;
  // Bottom-nav tab this step needs active, or null to leave whatever tab
  // is already showing alone (used for steps about the header/sidebar,
  // which don't care which tab is behind them).
  tab: TabId | null;
  sidebarOpen: boolean;
  // Element to draw the spotlight cutout around, or null for a plain
  // centered card (used for the welcome step, which has nothing to point
  // at yet).
  targetSelector: string | null;
  title: string;
  body: string;
  // Defaults to "Next" - only the final step overrides this, since tapping
  // it there closes the tour rather than moving to another step.
  nextLabel?: string;
  // Overrides the HUD's plain chevron with a bigger, explicitly-labeled
  // pill button showing this text - used for the stock-stepper pair, whose
  // whole point is "try tapping and holding as many times as you want, on
  // your own schedule, then tell us when you're ready" rather than moving
  // on the instant a single gesture is detected (the old behavior, and a
  // direct customer complaint - see TutorialOverlay.tsx's top comment).
  moveOnLabel?: string;
  // Shows the floating blue voice waveform panel while narration is
  // playing on this step. Exactly one step in this tour sets it - the
  // welcome, which is the only step with no spotlight target at all, so
  // it's the only place where the customer would otherwise be hearing a
  // voice come out of a page that looks completely idle. The field name
  // predates the panel (it drove a small in-HUD bar chip before); kept as
  // is so the property tour's matching field reads the same. See
  // TutorialVoiceWave.tsx.
  showSoundBar?: boolean;
  // A second spotlight target this one step switches to partway through -
  // TutorialOverlay switches the moment the step's own audio clip crosses
  // the halfway mark (audio.currentTime >= duration/2), or after
  // phase2FallbackMs if voice is muted and there's no clip playing to key
  // off of.
  targetSelectorPhase2?: string;
  phase2FallbackMs?: number;
  // A CSS selector that, while it matches anything in the document, holds
  // this step: narration pauses where it is and the glow hides, both
  // returning the moment it stops matching. The HUD deliberately stays put,
  // so there is always a way out of a held step.
  //
  // This exists for the one case where the tour asks the customer to do
  // something it then has no business talking over - tapping Scan Barcode
  // opens a live camera, and a voice still narrating around a ringed
  // viewfinder turns "point this at a barcode" into two things competing
  // for the same attention. It is deliberately expressed as a selector
  // rather than a step id special-cased in the overlay, because the next
  // step that needs it (a photo capture, a receipt scan) should only have
  // to name its own condition.
  pauseWhile?: string;
  // A CSS selector that has to match for this step to run at all. When it
  // does not match, the step is skipped in whichever direction the customer
  // was already travelling, exactly as a missing target is.
  //
  // This exists for the one thing a missing target cannot express: two
  // different things to say about the SAME control depending on the state of
  // the app around it. "Start Fresh" is the case. To somebody with a
  // connected sheet it is a safe round trip, and the sentence that matters is
  // that their spreadsheet is not touched. To somebody who skipped Google
  // sign-in it is a one-way wipe of the sample data, and saying "the next
  // step brings it back" would be a lie. One recorded clip cannot say both,
  // so there are two steps pointing at the same button, each gated on a
  // selector that only renders in one of the two states.
  //
  // It is also how the customer's "only continue into push and pull if they
  // actually sign in" is honoured. The push and pull steps need no gate of
  // their own, because AccountTab only renders those buttons for a connected
  // sheet and a step whose target never appears is already skipped - but that
  // is emergent, and this field is the place the intent is written down.
  //
  // Prefix the selector with "!" to invert it: the step then runs only while
  // nothing matches. Worth having because the interesting condition is often
  // an absence, and the presence that would stand in for it is not always
  // reliable - "no sheet connected" shows a Google sign-in button on a
  // configured deployment and a line of explanatory text on one where Sheets
  // was never set up, so gating on the button would silently drop the step
  // for the second group.
  requiresSelector?: string;
  // A CSS selector that, whenever it matches, takes over as the glow's
  // target, handing back to targetSelector the moment it stops matching.
  //
  // This is for the controls that reveal something bigger than themselves.
  // "Find at" is a small pill; tapping it drops a list of six retailers
  // below it, and that list is absolutely positioned, so it can never grow
  // the wrapper it lives in and a ResizeObserver on the button never hears
  // about it. The old tour therefore left a tight ring around the button
  // while the thing it was actually talking about - the stores - hung
  // underneath in the dark. That was the customer's own complaint about this
  // step: the glow did not fit the store dropdown.
  //
  // Deliberately not the same mechanism as targetSelectorPhase2, which fires
  // once, on a timer, whether or not the customer did anything. This one is
  // a condition rather than a schedule: it follows the customer when they
  // open the menu, and follows them back when they close it again.
  retargetWhilePresent?: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    chapter: "Getting started",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: null,
    showSoundBar: true,
    // Rewritten this round because the customer flagged that the welcome
    // narration still described UI that no longer exists: there is no "Skip
    // tour" button any more (the HUD closes with a plain X), no dialog card,
    // and nothing is dimmed. What it teaches now is the interaction model
    // the tour actually has - the page is live, amber means look here, and
    // every control lives in the corner HUD. welcome.mp3 was re-recorded
    // word for word from this text, so the two can't drift apart again.
    //
    // It also went through three recorded drafts before this one, and the
    // thing that got cut each time was length, not information. A first
    // draft covering all of the above ran 47.7s against the old clip's
    // 18.8s; a trim landed at 41.3s; this one is 28.9s. Nothing here is
    // decoration - every sentence teaches one rule the rest of the tour
    // then relies on - so the savings came from dropping what the tour
    // teaches better elsewhere. The old "we've loaded three sample items"
    // line is gone because the very next inventory step is standing in
    // front of those items and can say it while they're on screen, and the
    // "you can drag that bar" hint is gone because a bar that's in the way
    // is the moment someone discovers dragging, not a fact they need
    // 28 seconds before it could matter. If this ever needs another
    // sentence, take one out - a welcome no one sits through teaches
    // nothing at all.
    title: "Welcome to WS Inventory Management 👋",
    body: "I'm your guide, and I'll walk you through the whole app from right here. Nothing is locked, so the page stays live and you can tap anything you like. When I mention a control, it lights up with a soft amber glow. Everything else is in that little bar in the corner: arrows to move, a speaker to mute me, and an X to leave. Tap the forward arrow when you're ready.",
  },
  // Sits right after the welcome step so the consent banner gets resolved
  // before the tour starts pointing at the bottom nav — the banner renders
  // at z-50, above the nav's z-30, so until the customer chooses, it
  // physically covers the very tabs later steps spotlight. TutorialOverlay
  // filters this step out entirely when consent was already given (e.g. a
  // replayed tour), and auto-advances it the moment a choice is made - the
  // one narrative-content step still allowed to move on by itself, since
  // there's nothing to narrate here that a "Next" tap would add to.
  {
    id: "cookie-consent",
    chapter: "Getting started",
    tab: null,
    sidebarOpen: false,
    targetSelector: '[data-tutorial="cookie-banner"]',
    title: "First, a quick choice",
    body: "Pick Accept or Decline below — either is fine, the app only uses essential cookies. Choosing now also clears this banner out of the way for the rest of the tour.",
  },
  {
    id: "header-theme-toggle",
    chapter: "Getting started",
    tab: null,
    sidebarOpen: false,
    targetSelector: '[data-tutorial="header-theme-toggle"]',
    title: "Light or dark, any time",
    body: "This flips the whole app between light and dark mode whenever you like. It sticks until you tap it again.",
  },
  // Split out from the old combined "header-tools" step into its own, so
  // the customer can actually try the hold gesture rather than just being
  // told about it - see ClearCacheButton.tsx's tutorialDud prop, which
  // this step relies on to make that safe: the full hold-and-reveal
  // animation plays out exactly like the real thing, but nothing is
  // actually cleared while the tutorial is open.
  {
    id: "header-clear-cache-test",
    chapter: "Getting started",
    tab: null,
    sidebarOpen: false,
    targetSelector: '[data-tutorial="header-clear-cache"]',
    // Rewritten this round - the customer's "step 3 could use some TLC."
    // The old copy opened on "Next to it," which pointed at nothing once the
    // theme toggle became its own separate step, and leaned on "actually" /
    // "for real" three times in four sentences. Its title also produced the
    // single worst line in the tour back when a script transform turned em
    // dashes into periods: "Try the refresh button. safely."
    // The em dash is gone from the title now, not just the body. That transform
    // is dead code, but a spoken title reading "Try the refresh button. safely."
    // is exactly what gets shipped again the moment somebody reintroduces it,
    // and a comma reads correctly either way.
    title: "Try the refresh button, safely",
    // Only the em dash changed here. The recorded clip for this step is one of
    // the few that opens straight into the body with no spoken title, so the
    // first sentence has to stay exactly as recorded - it is the first thing the
    // customer hears, and a screen reader has to say the same words.
    body: "This one is the refresh button, and it's safe to try right now. If the app ever looks stuck or out of date, holding this icon gives it a completely fresh start. Go ahead and press and hold it for a moment. While the tour is open it only runs a preview, so nothing on your device will actually be cleared. Outside the tour, holding it clears this device's saved settings and reloads the page. Your inventory itself is never touched.",
  },
  // Split from a single "stock-controls" step into two, each waiting for
  // the customer to explicitly move on (moveOnLabel below) rather than
  // reading both instructions aloud back-to-back or jumping ahead the
  // instant one gesture is detected — a direct fix for "it moves on too
  // quickly after just a single tap." The customer can tap and hold as
  // many times as they want on their own schedule before choosing Move on.
  //
  // Both spotlight the − button itself rather than the whole quantity row:
  // the row is about 470px wide while the two buttons the narration actually
  // names are barely 30px each, so a customer heard "tap minus or plus" and
  // was shown a strip covering half the card. The + button and the quantity
  // chip especially matters here, since watching that number change is the
  // whole feedback loop these two steps teach - and now that nothing on the
  // page is dimmed, it is plainly visible right next to the glowing button.
  {
    id: "stock-controls-tap",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-stock-decrement"]',
    moveOnLabel: "Move on",
    title: "Adjust stock in a tap",
    body: "Go ahead and tap − or + on this item to log a unit at a time. Try it as many times as you like.",
  },
  {
    id: "stock-controls-hold",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-stock-decrement"]',
    moveOnLabel: "Move on",
    title: "Hold for bigger changes",
    body: "Now try pressing and holding either button — that adjusts several at once, handy for a big restock or a big pull. Take your time; tap Move on whenever you're ready to keep going.",
  },
  // Deliberately placed straight after the two stepper steps, because the
  // chip this points at only exists once the customer has actually adjusted
  // something — and by here they just have. It survives the whole tour
  // rather than timing out after ten seconds (see page.tsx's expiry effect,
  // which stands down while the tour is running), so the glow always has
  // something real to wrap. A customer who tapped Move on without touching
  // either button has no chip, and the overlay quietly skips the step rather
  // than glowing around nothing.
  {
    id: "stock-undo",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-stock-undo"]',
    title: "Tapped one too many? Undo it",
    body: "Tap one too many and this Undo chip appears, right under the buttons. It puts the count back where it was, and it takes the entry out of your usage history with it. That second part is the one that matters. A unit you never actually took off the shelf should not turn up in next month's numbers as if you did.",
  },
  {
    id: "inventory-search-sort",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="inventory-search"]',
    targetSelectorPhase2: '[data-tutorial="inventory-sort"]',
    phase2FallbackMs: 4000,
    title: "Find anything fast",
    body: "Search by name, barcode, or location. Next to it, the sort menu can bump low-stock items straight to the top of the list.",
  },
  {
    id: "inventory-import-export",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="inventory-import-export"]',
    title: "Bring in — or back up — a whole spreadsheet",
    body: "Already track inventory in a spreadsheet? Import it here in one go. Export works the same way in reverse, any time you want a copy on hand.",
  },
  {
    id: "inventory-share-barcodes",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="inventory-share-barcodes"]',
    title: "Sharing is caring",
    body: "Send your saved barcode-to-item matches to a teammate, or pull in theirs. It's handy the first time you're both starting from scratch, so neither of you has to scan everything twice.",
  },
  // Trimmed down from the old combined step: the quantity-chip explanation
  // that used to open this step is gone, and what's left is a brief
  // overview before three dedicated steps below let the customer try each
  // icon themselves.
  {
    id: "item-action-icons",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-action-icons"]',
    title: "A closer look at these icons",
    body: "Over on the right, the icons cover breaking down a case, moving stock to another location, editing details, and deleting. Give each one a try, one at a time.",
  },
  {
    id: "item-action-breakdown",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-action-breakdown"]',
    title: "Break down a case",
    body: "Tap this icon to split a sealed case into individual units. It's handy the moment a case actually gets opened, so the count stays accurate at both levels.",
  },
  {
    id: "item-action-edit",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-action-edit"]',
    title: "Edit the full details",
    body: "The pencil opens this item's full details, including name, barcode, reorder point, usage tracking window, and more.",
  },
  {
    id: "item-action-delete",
    chapter: "Inventory",
    tab: "inventory",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="item-action-delete"]',
    title: "Delete for good",
    body: "And the trash icon removes an item entirely. It'll always ask you to confirm first, so there's no risk of an accidental tap losing anything.",
  },
  {
    id: "scan",
    chapter: "Scan",
    tab: "scan",
    sidebarOpen: false,
    // Points at the real blue "Scan Barcode" button rather than the
    // bottom-nav tab icon that got you here. Self-resolves once the camera
    // episode ends - a real scan or a cancel, either one (see
    // TutorialOverlay.tsx's scan effect) - and the manual Next in the corner
    // HUD still works too, for a customer with nothing on hand to scan right
    // now.
    targetSelector: '[data-tutorial="scan-action-area"]',
    // Holds the whole step while the camera is open. See pauseWhile above,
    // and ScanTab.tsx's data-tutorial-scanning.
    pauseWhile: '[data-tutorial-scanning="true"]',
    title: "Scan barcodes or receipts",
    body: "Tap Scan Barcode and point the camera at any barcode you have to hand. The tour waits quietly while the camera is open, so take as long as you need. Nothing to scan right now? Cancel the camera and we will carry on.",
  },
  // The other half of the customer's ask: once the camera closes, the glow
  // moves onto what the scan actually produced. Split off as its own step
  // rather than folded into the one above, because the thing being explained
  // changes completely - "go and scan something" and "here is what came
  // back" are two moments, and the second one only makes sense once the
  // first has happened.
  {
    id: "scan-details",
    chapter: "Scan",
    tab: "scan",
    sidebarOpen: false,
    // Starts tight on the Barcode field itself, which is literally what the
    // customer pointed at, then widens to the whole card partway through -
    // the description, location, quantity and price are all part of the same
    // result and the narration reaches them in that order.
    targetSelector: '[data-tutorial="scan-barcode-field"]',
    targetSelectorPhase2: '[data-tutorial="scan-details-card"]',
    phase2FallbackMs: 5000,
    title: "What the scan filled in",
    body: "The barcode lands here, and the description and price fill themselves in whenever the product is one we can look up. Anything left blank is yours to type. Set the quantity, then use Add Stock or Remove to log the movement.",
  },
  {
    id: "scan-modes",
    chapter: "Scan",
    tab: "scan",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="scan-mode-toggle"]',
    title: "Two ways to log stock",
    body: "Barcode mode is for one item at a time. Receipt mode reads a whole photographed receipt at once, which is great right after a big supply run. Accuracy can be hit or miss on a crumpled or blurry receipt, so it's worth a quick double-check of the results before trusting them completely.",
  },
  // Rebuilt from a single combined step into four narrower ones (this one,
  // then search-and-find, then package tracking, then a dedicated share
  // step) so each idea gets its own moment instead of being read back to
  // back over one narration clip. This step used to ask for a few seconds
  // with the dim suppressed so the customer could see the real reorder list
  // plainly; that is now how every step behaves, so the field is gone.
  {
    id: "reorder",
    chapter: "Reorder",
    tab: "reorder",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="reorder-low-stock-text"]',
    title: "Never run out unexpectedly",
    body: "This is Reorder — it automatically lists everything at or below the reorder point you've set for it. Take a look at this item; its low-stock warning is right here.",
  },
  // Was one step, "reorder-search-and-find", which introduced the search-by
  // toggle and the Find at menu over a single clip and then let the customer
  // work out the rest. Split into three on their note: how it searches, then
  // a real search by barcode, then the same search by description. Three
  // moments, because the middle one is the customer leaving for a retailer
  // site and coming back, and a step they walk away from is not a good place
  // to still be carrying an unrelated idea.
  {
    id: "reorder-search-by",
    chapter: "Reorder",
    tab: "reorder",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="reorder-search-by-toggle"]',
    title: "Decide what it searches for",
    body: "Before you go looking for anything, this row decides what gets typed into the store's search box for you. Auto uses the barcode when the item has one and falls back to the name when it does not. Barcode and Description pin it to one or the other. It is remembered on this device, so it is a one time choice rather than something to think about on every order.",
  },
  {
    id: "reorder-find-at-barcode",
    chapter: "Reorder",
    tab: "reorder",
    sidebarOpen: false,
    // Starts on the Barcode pill (the thing the customer is being asked to
    // tap) and moves to the Find at button once the narration reaches it.
    targetSelector: '[data-tutorial="reorder-search-by-barcode"]',
    targetSelectorPhase2: '[data-tutorial="reorder-find-at-button"]',
    phase2FallbackMs: 5000,
    // And once they open it, the glow grows onto the list of stores itself.
    // See retargetWhilePresent above.
    retargetWhilePresent: '[data-tutorial="reorder-find-at-menu"]',
    title: "Search a store by barcode",
    body: "Tap Barcode, then tap Find at and pick a store. A barcode is the most exact thing you can hand a retailer, so this usually lands you on the product page itself rather than a page of near misses. It opens in a new tab, so this list stays right where it is. Go and have a look, then come back and tap the arrow.",
  },
  {
    id: "reorder-find-at-description",
    chapter: "Reorder",
    tab: "reorder",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="reorder-search-by-description"]',
    targetSelectorPhase2: '[data-tutorial="reorder-find-at-button"]',
    phase2FallbackMs: 5500,
    retargetWhilePresent: '[data-tutorial="reorder-find-at-menu"]',
    title: "Now search the same store by description",
    body: "Now tap Description and try the same store again. This is the one you will lean on for anything without a barcode, and for the supplies where any brand will do. The results are broader, so check the size and the pack count before you buy. Whichever of the two you leave selected is the one it will use next time.",
  },
  // Moved ahead of the new dedicated share step per the customer's own
  // reordering.
  {
    id: "reorder-package-tracking",
    chapter: "Reorder",
    tab: "reorder",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="reorder-package-tracking"]',
    title: "Jot down a tracking number",
    body: "Once you've ordered, save the tracking number here for a quick link to the carrier's tracking page. It's simple by design, just a place to keep the number handy, not a live delivery tracker.",
  },
  {
    id: "reorder-share",
    chapter: "Reorder",
    tab: "reorder",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="reorder-share-button"]',
    title: "Send the whole list to a supplier",
    body: "Tap Share to text or email this entire reorder list straight to a supplier. That's everything currently at or below its reorder point, in one go.",
  },
  // Rebuilt: narrows the overview list to just this one item (see
  // UsageOverview.tsx's tutorialFocusItemId) so the customer isn't hunting
  // through a whole list, then self-resolves the moment they actually tap
  // into it (see TutorialOverlay.tsx's usage effect) — real exploration is
  // the point of this step, not narration to sit through.
  {
    id: "usage",
    chapter: "Usage",
    tab: "usage",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="usage-overview-list"]',
    title: "See how fast things move",
    body: "Usage charts how quickly each item gets used and estimates how many days of stock are left at that pace. We've narrowed the list to just this one item for now — go ahead and tap into it to see its full detail view.",
  },
  // The customer's item 6: this was one step that waved at the whole row of
  // range buttons and left the customer to work out which one to press. Four
  // sub-steps now follow it, one per range they named, because "7d, 14d, 30d,
  // 90d, 1y, All" is only obvious to somebody who already knows what they are
  // looking for. A fresh hire needs to be told which question each range
  // answers, and the answers are genuinely different questions rather than
  // the same one at different zoom levels.
  //
  // 14d and 1y deliberately get no step of their own. They are the in-between
  // settings, and they explain themselves once the four either side of them
  // have been explained; a step per button would be six steps of narration
  // for a row of buttons, which is exactly the kind of thing that made the
  // old tour a slog.
  {
    id: "usage-detail-timeframes",
    chapter: "Usage",
    tab: "usage",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="usage-timeframe-buttons"]',
    title: "Zoom in or out on any time frame",
    body: "These buttons switch the chart between a week, a month, a few months, or all-time. It's the fastest way to tell a one-off spike apart from a real ongoing trend.",
  },
  {
    id: "usage-timeframe-7",
    chapter: "Usage",
    tab: "usage",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="usage-timeframe-7"]',
    title: "Seven days answers what changed",
    body: "Tap 7d. A week is short enough that one busy day still shows up as a bump, which is what you want when somebody says we are going through these faster than usual. If this number looks nothing like the longer ranges, something changed recently and it is worth finding out what.",
  },
  {
    id: "usage-timeframe-30",
    chapter: "Usage",
    tab: "usage",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="usage-timeframe-30"]',
    title: "Thirty days is your ordering rhythm",
    body: "Now tap 30d. This is the one most people live in, because it lines up with how often orders actually get placed. A single quiet weekend or one heavy Monday stops mattering at this length, so the average you see here is close to what you should be buying.",
  },
  {
    id: "usage-timeframe-90",
    chapter: "Usage",
    tab: "usage",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="usage-timeframe-90"]',
    title: "Ninety days shows the season",
    body: "Tap 90d. Three months is long enough to see the shape of a year forming. Salt and windshield fluid climb into winter, filters and coolant climb into summer, and none of that is visible in a week. This is the range to check before you commit to a big order.",
  },
  {
    id: "usage-timeframe-all",
    chapter: "Usage",
    tab: "usage",
    sidebarOpen: false,
    targetSelector: '[data-tutorial="usage-timeframe-all"]',
    title: "All time is the honest average",
    body: "Last one. All uses every movement ever recorded for this item, back to the first one. It is the fairest number you have for setting a reorder point, because it is not flattered by a good month or dragged down by a slow one. Whichever range you leave selected only changes what you are looking at, never the underlying history.",
  },
  {
    id: "support",
    chapter: "Support",
    tab: "support",
    sidebarOpen: false,
    // The real chat widget, not the bottom-nav tab icon - the spotlight's
    // cutout leaves the chat's real input/messages fully clickable/typable
    // during this step, so a customer can actually try it while pointed
    // at it.
    targetSelector: '[data-tutorial="support-chat"]',
    title: "Stuck? Clyde's here",
    body: "Support has Clyde, a free AI assistant you can open any time a question comes up — no need to leave the app. It remembers what you've told it earlier in the same conversation, so you don't have to repeat yourself as you dig into an issue.",
  },
  {
    id: "account-gear",
    chapter: "Account",
    tab: null,
    sidebarOpen: false,
    targetSelector: '[data-tutorial="account-gear"]',
    title: "Your account lives here",
    body: "The gear icon opens your account: Google Sheets sync, app settings, and billing. Tap it now (or tap Next) to take a look.",
  },
  {
    id: "google-signin",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="google-signin"]',
    // This step used to set showSoundBar too. It doesn't any more: the
    // customer scoped the waveform to "only the welcome step of the
    // inventory page and the welcome step of the property page." Here the
    // amber glow is already on a real button, so a second animated element
    // was competing with the thing the narration is telling them to look
    // at.
    title: "Here is the fork in the road",
    // Rewritten for the customer's item 8: this step has to be an honest
    // choice rather than an optional extra waved past. Everything after it is
    // either about the sheet or short, so a customer who does not want a
    // Google account should be told that plainly here instead of watching
    // four steps get skipped and wondering what they missed.
    body: "Everything from here on is about the spreadsheet, so this is worth stopping on. Signing in with Google puts your inventory in a spreadsheet you own, readable from any computer, and still there if this phone goes in a puddle. If you want that, sign in now and I will walk you through sending it up and pulling it back. If you would rather not have a Google account tied to this, that is a completely fair answer, and you can close the tour with the X in the corner. Nothing you have learned so far depends on it.",
  },
  // The next three steps (push, Start Fresh, pull) are a deliberate
  // sequence per the customer's own doc: push this device's current
  // inventory up, clear it locally, then pull it back down — a genuine
  // round trip that demonstrates why Google Sheets sync exists, not just
  // what the buttons do. All three gracefully do nothing but sit there if
  // Google Sheets was skipped above — see AccountTab.tsx's existing
  // conditional rendering, unchanged this round.
  {
    id: "account-push-test",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-push-button"]',
    title: "Push sends this device's copy up",
    // No longer hedged with "if you connected Google Sheets a moment ago" -
    // AccountTab only renders this button for a connected sheet, so a
    // customer who skipped sign-in never reaches this step at all. The old
    // conditional wording was the tour apologising for a situation it was
    // already handling.
    body: "Tap Push to Sheet now. It sends this device's current inventory up to your spreadsheet, and it is the half of syncing that people forget. Nothing goes up on its own. It happens when you tap this, and only when you tap this.",
  },
  {
    id: "account-name-tag",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-name-tag"]',
    title: "Put a name on your changes",
    body: "Add your name here so teammates working the same inventory can see who made a change and when. It's just a label, not a login, and anyone on this device can update it.",
  },
  // Two steps, one button. See TutorialStep.requiresSelector above: "Start
  // Fresh" is a safe round trip to somebody with a connected sheet and a
  // one-way wipe to somebody without one, and telling the second group that
  // the next step brings it all back would be a lie. The two gates are the
  // same selector, one of them inverted, so exactly one of these always runs
  // and neither customer is left without an explanation of the button.
  {
    id: "start-fresh",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="start-fresh-local"]',
    requiresSelector: '[data-tutorial="account-sheets-actions"]',
    title: "Clear this device's copy",
    // The "does not delete the sheet" sentence is the point of this step, not
    // a reassurance tacked on the end. The customer called it out by name as
    // a data-loss-prevention point: somebody who believes Start Fresh wipes
    // their spreadsheet will never touch it, and somebody who finds out the
    // hard way that it does not will have pushed the wrong data up first.
    body: "Tap Start Fresh whenever you are ready. Read this part carefully, because it is the one people get wrong. Start Fresh clears this device and only this device. It does not delete your Google Sheet, it does not empty it, and it does not change a single row in it. Your spreadsheet sits there exactly as you left it, which is why the very next step can bring the whole lot back down.",
  },
  {
    id: "start-fresh-solo",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="start-fresh-local"]',
    requiresSelector: '![data-tutorial="account-sheets-actions"]',
    title: "Clear this device's copy",
    body: "Start Fresh clears this device: the sample items, and anything you have added or changed while we have been talking. Since you have not connected a spreadsheet, there is nowhere to bring it back from afterwards, so this one is a one way trip today. That changes the moment you connect a sheet and push to it. Tap it if you want a clean slate to start your real stock on, or leave it alone and tap the arrow.",
  },
  {
    id: "account-pull-test",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-pull-button"]',
    title: "Pull brings it back down",
    body: "Now tap Pull from Sheet, and watch everything you just cleared come straight back. That is the whole point of the last three steps in one motion. Your inventory does not live on this phone. It lives in a spreadsheet you own, and this device is just one way of looking at it.",
  },
  {
    id: "account-manage-property",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-manage-property"]',
    title: "Track equipment, not just stock",
    body: "Property is a separate space for tracking equipment and fixtures, including ordered parts and maintenance status. It syncs to its own tab on the same spreadsheet.",
  },
  {
    id: "account-reminders-install",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-reminders-toggle"]',
    targetSelectorPhase2: '[data-tutorial="account-install-app"]',
    phase2FallbackMs: 4200,
    title: "Reminders, and a home-screen shortcut",
    body: "Turn on daily reminders and you'll only hear from us when something's actually worth checking. And if you'd like this app to feel less like a browser tab, you can install it right to your home screen from here.",
  },
  {
    id: "account-replay-tour",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    targetSelector: '[data-tutorial="account-replay-tour"]',
    title: "Come back to this tour any time",
    body: "This link brings this exact walkthrough back whenever you want a refresher. It's the only way to see it again now, since it no longer opens automatically.",
  },
  {
    id: "tour-complete",
    chapter: "Account",
    tab: null,
    sidebarOpen: true,
    // Deliberately targetless. This used to spotlight "Manage Property" -
    // the exact same control step 29 already points at - so the closing
    // line landed on a button the customer had just been taught, which
    // read like the tour had lost its place. A goodbye isn't attached to a
    // control, so with a null target no glow is drawn at all - just the
    // HUD over the live app, which is the right note to end on.
    targetSelector: null,
    title: "That's the tour!",
    body: "You're all set. Explore Inventory on your own from here, or tap Manage Property above to keep going with equipment tracking.",
    nextLabel: "Finish tour",
  },
];

// Robust "wait for a DOM node to exist" helper, used to find each step's
// spotlight target after a tab switch or sidebar open triggers a React
// re-render - the node isn't guaranteed to exist in the very same tick a
// step becomes active (switching tabs unmounts/remounts a whole tab's
// component tree). Reuses the same MutationObserver approach proven out
// while testing this app's own live behavior earlier this session: instead
// of fixed-interval polling, react the instant the DOM actually changes,
// with a timeout as a backstop for steps whose target genuinely never
// appears (e.g. Google Sheets isn't configured on this deployment, so the
// "Sign in with Google" button never renders at all - that step should
// give up gracefully rather than hang).
export function waitForElement(selector: string, timeoutMs = 1500): Promise<HTMLElement | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  const existing = document.querySelector<HTMLElement>(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (el: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(el);
    };
    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) finish(el);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => finish(null), timeoutMs);
  });
}
