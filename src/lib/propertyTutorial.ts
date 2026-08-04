"use client";

// The Property page's own guided tour — same coach-mark idea as
// tutorial.ts/TutorialOverlay.tsx (glow around one real element, explain
// it, Next/Skip, page stays fully live), but scoped to a single page rather
// than the tabbed main app, so there's no tab/sidebar state to drive here.
// See PropertyTutorialOverlay.tsx for how these get rendered.
//
// Round "R" — rebuilt from the customer's Part 3 reference footage. What
// changed, and why it matters:
//
//   * The seeded example property is GONE. It used to be planted on every
//     tour start so the walkthrough had something to point at; the customer's
//     note was unambiguous ("the example property should be removed and no
//     longer shipped live"), and they're right — a tour that narrates a
//     record the customer didn't make teaches them to watch, not to do. Every
//     step below now points at something the customer built themselves,
//     minutes earlier, with their own imaginary equipment.
//
//   * Because of that, the whole tour is a build: name a property, order a
//     part for it, look at it in a store, move it through its statuses, undo
//     one, open the history, add the repair job, schedule it, edit the
//     property, push it to the sheet, then go look at the sheet. Every
//     "watch this" step became a "do this" step.
//
//   * Steps that ask for a real action wait for that real action —
//     see `advanceOn` below. Nothing auto-advances off narration alone.
//
//   * The narration says WHY, not just what. The customer asked for real
//     world case uses, and the reason is that a status dropdown explained as
//     a status dropdown is forgettable; a status dropdown explained as "the
//     person who ordered the part is not the person standing in front of the
//     machine at seven in the morning" is not.
export interface PropertyTutorialStep {
  id: string;
  targetSelector: string | null;
  title: string;
  body: string;
  // Defaults to "Next" — only the final step overrides this, since tapping
  // it there closes the tour rather than moving to another step.
  nextLabel?: string;
  // Shows the floating blue voice waveform panel while narration plays on
  // this step. Same field, same meaning, and the same "welcome step only"
  // scope as the main tour's — see tutorial.ts's copy of this comment and
  // TutorialVoiceWave.tsx.
  showSoundBar?: boolean;
  // A second spotlight target this one step moves to, the moment that
  // element actually appears on the page. This is deliberately NOT the main
  // tour's trigger: TutorialStep.targetSelectorPhase2 over in tutorial.ts
  // switches at the halfway point of the step's own audio clip, which suits
  // a step that narrates two things in sequence. Here the switch is a
  // consequence of the customer's own tap — they press "Add property", the
  // button unmounts, the form takes its place — so the honest trigger is
  // "when the form shows up", however long that takes. Keying it to audio
  // was the actual bug the customer reported ("makes the glow jump across
  // the screen"): the glow was still measuring a button that no longer
  // existed. See PropertyTutorialOverlay.tsx's watchForElement.
  targetSelectorPhase2?: string;
  // A selector that borrows the glow for as long as it matches, handing it
  // back the moment it stops. Same field, same meaning as the main tour's —
  // see TutorialStep.retargetWhilePresent in tutorial.ts. Here it is the
  // part row's "Find at" menu: a cart icon the size of a thumbnail that
  // drops a list of six stores below it, where the stores are the thing
  // worth looking at.
  //
  // Different from targetSelectorPhase2 above in one way that matters: that
  // one is a one-way handoff for a control that replaces itself and never
  // comes back, this one is reversible because the customer can close what
  // they opened.
  retargetWhilePresent?: string;
  // Auto-advance when the customer really does the thing this step is
  // asking for. The overlay is handed a set of counters by PropertyManager
  // (one per real action) and moves on the moment the named counter goes up.
  // A step with this set still has a working Next arrow — the wait is an
  // offer to do it for real, never a lock.
  advanceOn?: PropertyTourSignal;
}

// The real actions the tour can wait on. PropertyManager increments one
// counter per occurrence and hands the whole set to the overlay on every
// render; the overlay compares against the value it saw when the current
// step opened. Counters rather than booleans so a second part (or a second
// status change) still reads as "something happened just now".
export type PropertyTourSignal =
  | "propertyAdded"
  | "partAdded"
  | "taskAdded"
  | "partStatusChanged"
  | "taskStatusChanged"
  | "pushed";

export type PropertyTourSignals = Record<PropertyTourSignal, number>;

export const EMPTY_PROPERTY_TOUR_SIGNALS: PropertyTourSignals = {
  propertyAdded: 0,
  partAdded: 0,
  taskAdded: 0,
  partStatusChanged: 0,
  taskStatusChanged: 0,
  pushed: 0,
};

export const PROPERTY_TUTORIAL_STEPS: PropertyTutorialStep[] = [
  {
    id: "welcome-property",
    targetSelector: null,
    showSoundBar: true,
    title: "Let's build one together 🔧",
    body: "This page is for the things you take care of, rather than the things you keep on a shelf. A rooftop unit, a delivery van, a washing machine in a laundry room. We are going to set one up together, from the empty page to a finished record on your spreadsheet. Make the equipment up if you like, because nothing here has to be real yet. Tap Next when you are ready.",
  },
  {
    id: "property-sync-actions",
    targetSelector: '[data-tutorial="property-sync-actions"]',
    title: "It syncs to its own tab",
    body: "Property gets its own tab on the same Google Sheet your inventory already uses. Push sends this device's list up to it, and Pull brings it back down. We will come back here at the end, once you have built something worth sending.",
  },
  {
    id: "add-property",
    targetSelector: '[data-tutorial="add-property-button"]',
    targetSelectorPhase2: '[data-tutorial="add-property-form"]',
    advanceOn: "propertyAdded",
    title: "Name the thing you look after",
    body: "Tap Add property, and the form opens right where the button was. Give it a name you would actually recognize on a work order, like Washing Machine, Laundry Room. Location, serial number, and notes are all optional, so fill in what you know and leave the rest empty. Tap Add when you are happy with it, and I will pick things up from there.",
  },
  {
    id: "new-property-card",
    targetSelector: '[data-tutorial="tour-property"]',
    title: "That card is yours now",
    body: "There it is. Your own property, with its own parts list and its own maintenance list underneath. Everything else we do today hangs off this one card.",
  },
  {
    id: "health-rollup",
    targetSelector: '[data-tutorial="tour-health"]',
    title: "One line, so you never open all of them",
    body: "This line is the whole reason the card exists. It tells you what is on order, what is running late, and what still needs doing, so you can look down a list of twenty machines and know which one wants you today. Yours says all clear right now, because we have not given it anything to worry about yet. Let's fix that.",
  },
  {
    id: "add-part-open",
    targetSelector: '[data-tutorial="tour-add-part"]',
    targetSelectorPhase2: '[data-tutorial="tour-add-part-form"]',
    title: "Something broke — order the replacement",
    body: "Say the drive belt snapped this morning and a new one has to go on order. Tap Add a part, and the form opens up underneath.",
  },
  {
    id: "part-lookup",
    targetSelector: '[data-tutorial="tour-part-lookup"]',
    // The picker only exists when a lookup comes back with more than one
    // plausible match, so the glow moves onto it if and when it appears. The
    // property tour's phase-2 has no deadline, which is exactly right here:
    // the customer may sit and read for twenty seconds before they type
    // anything, and a timer would have given up long before that.
    targetSelectorPhase2: '[data-tutorial="tour-part-candidates"]',
    title: "Let the part number do the typing",
    body: "If you have a part number, off the old part or out of the manual, type it here and tap Look up. It fills in the description and a rough price for you, which beats typing all of it twice. When more than one product matches, it shows you the choices instead of guessing, and you pick the one that looks right. If you do not have a part number at all, skip this field completely.",
  },
  {
    id: "part-description",
    targetSelector: '[data-tutorial="tour-part-description"]',
    // The second half of the customer's "show me searching by description in
    // both places" note - the Reorder tab covers it for stock items, this
    // covers it for parts, where far more often than not there is no part
    // number to be had.
    title: "No part number? Describe it instead",
    body: "This field is the only thing the form truly needs, and it is what you fall back on when there is no part number anywhere on the old part. Write it the way you would say it out loud to somebody behind a trade counter, like GE dryer drive belt. That description is also what gets searched when you go looking for it in a store in a moment, so a few extra words here save you scrolling through the wrong products later.",
  },
  {
    id: "part-details",
    targetSelector: '[data-tutorial="tour-add-part-form"]',
    advanceOn: "partAdded",
    title: "Fill in what you know",
    body: "Quantity, price, and an expected by date are all optional, but the expected date earns its five seconds. The row turns red on its own the day the part is late, so a delivery that quietly never arrived cannot hide from you. Tap Add part when you are done.",
  },
  {
    id: "new-part-row",
    targetSelector: '[data-tutorial="tour-part"]',
    title: "On the board, and on the clock",
    body: "Your part starts life as Ordered, and everything about it lives on this one line. What it is, how many, when it is due, and the buttons that move it along. The little package icon logs deliveries as they arrive, which is what you want when six of ten show up on Tuesday and the rest come Friday.",
  },
  {
    id: "part-find-at-store",
    targetSelector: '[data-tutorial="tour-part-find"]',
    // And once they open it, the glow grows onto the list of stores itself,
    // which is the thing actually worth looking at. See retargetWhilePresent
    // above for why a ResizeObserver on the icon could never manage this.
    retargetWhilePresent: '[data-tutorial="tour-part-find-menu"]',
    title: "Go and price it, I'll wait",
    body: "Have not actually ordered it yet? Tap the cart icon and pick a store from the list that drops down. It searches that retailer for the description you just wrote, in a brand new tab, so you can compare prices, order it, and come straight back. This page will still be sitting right here waiting for you. Take as long as you need, and tap the arrow when you are back.",
  },
  {
    id: "part-status",
    targetSelector: '[data-tutorial="tour-part-status"]',
    advanceOn: "partStatusChanged",
    title: "Move it along",
    body: "This dropdown carries a part through its life. Ordered, Shipped, Received, Installed, or Cancelled. Change yours now. Say the supplier just emailed a tracking number, so mark it Shipped. This matters because the person who ordered the part is almost never the person standing in front of the machine at seven in the morning wondering where it is.",
  },
  {
    id: "status-undo",
    targetSelector: '[data-tutorial="tour-status-undo"]',
    title: "Picked the wrong one? Undo it",
    body: "Undo puts the status back exactly where it was, and takes the entry back out of the history with it, so a mis-tap does not leave a permanent mark on a record somebody else is going to read. It appears right here after every status change, and stays until you make another one.",
  },
  {
    id: "status-history",
    targetSelector: '[data-tutorial="tour-part-history"]',
    title: "The whole story, timestamped",
    body: "The clock icon opens every status this part has ever had, when it changed, and who changed it. When a supplier insists the part shipped last Tuesday, this is the line you screenshot.",
  },
  {
    id: "add-task",
    targetSelector: '[data-tutorial="tour-add-task"]',
    advanceOn: "taskAdded",
    title: "Parts are only half of it",
    body: "Down here you track the actual work. Repair the broken belt when the replacement arrives. Annual inspection. Chase the leak under the drum. Type one in and press the plus. Anything you would otherwise scribble on a sticky note and lose belongs in this list, and from now on any part you order can be linked to the job it was bought for.",
  },
  {
    id: "task-status",
    targetSelector: '[data-tutorial="tour-task-status"]',
    advanceOn: "taskStatusChanged",
    title: "Say where the work stands",
    body: "Tasks move through their own set. Needed, Scheduled, In progress, Completed, or Cancelled. Set yours to Scheduled, which is the one that answers the Monday morning question of whether anybody actually booked the technician. Completed and Cancelled tuck the row away into a closed list, so what stays on screen is only what is still live.",
  },
  {
    id: "edit-property",
    targetSelector: '[data-tutorial="tour-edit"]',
    targetSelectorPhase2: '[data-tutorial="tour-edit-form"]',
    title: "Nothing is locked in",
    body: "One last change before we send it up. Tap Edit and add something small, a serial number off the plate, or a note like filter size twenty by twenty five. Save it when you are done. A property you set up in a hurry can always be filled in properly later.",
  },
  {
    id: "push-after-edit",
    targetSelector: '[data-tutorial="property-sync-actions"]',
    advanceOn: "pushed",
    title: "Now send it up",
    body: "Tap Push to Sheet. The property, the part, its whole status history, and the maintenance task all go up into the Property tab on your spreadsheet. This is the step people forget, and it is the one that counts, because an edit that only lives on your own phone is not a record anybody else can see.",
  },
  {
    id: "open-the-sheet",
    targetSelector: '[data-tutorial="property-open-sheet"]',
    title: "Go and look at it",
    body: "Open your Google Sheet and find the Property tab along the bottom. Everything you just typed is sitting in it, in plain columns, ready to be shared or printed or filtered by whoever needs it. That is the proof that this is not just an app on your phone. Come back to this tab when you have had a look.",
  },
  {
    id: "replay-tour",
    targetSelector: '[data-tutorial="property-replay-tour"]',
    title: "Come back to this tour any time",
    body: "This link brings this exact walkthrough back whenever you want a refresher.",
  },
  {
    id: "wrap-up",
    targetSelector: '[data-tutorial="tour-delete"]',
    title: "That's Property tracking!",
    body: "Everything you just built is real, and it is yours to keep. If you made the equipment up, the trash icon removes it and you can start again on the real thing. Close this with the X up in the corner whenever you are ready.",
    nextLabel: "Finish tour",
  },
];
