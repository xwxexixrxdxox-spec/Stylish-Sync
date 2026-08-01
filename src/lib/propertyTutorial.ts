"use client";

import { PropertyItem } from "@/lib/types";
import { getEditorName } from "@/lib/storage";

// The Property page's own guided tour — same coach-mark idea as
// tutorial.ts/TutorialOverlay.tsx (dim the screen, spotlight one real
// element, explain it, Next/Skip), but scoped to a single page rather than
// the tabbed main app, so there's no tab/sidebar state to drive here. See
// PropertyTutorialOverlay.tsx for how these get rendered.
//
// Engine-only update this round ("O"): PropertyTutorialOverlay.tsx picked
// up the same draggable-HUD/back-arrow/no-auto-advance changes as the main
// tour (see its own top comment), but this file's actual step CONTENT is
// still the pre-seeded-example walkthrough from the K/L rounds. The
// customer's "Part 3" doc calls for a much bigger, hands-on rework here —
// have the customer type in a real new property from scratch, add a real
// part, click through to a retailer's cart, a more noticeable status-change
// UI with an undo affordance, a maintenance task walkthrough — none of
// which exists as a feature yet (there's no undo-last-status-change control
// today, just the "Reopen a closed row" affordance - see PropertyManager.tsx).
// That's queued as its own follow-up rather than folded in here; see the
// project notes doc for the full breakdown of what's still open.
export interface PropertyTutorialStep {
  id: string;
  targetSelector: string | null;
  title: string;
  body: string;
  // Defaults to "Next" — only the final step overrides this, since tapping
  // it there closes the tour rather than moving to another step.
  nextLabel?: string;
}

export const PROPERTY_TUTORIAL_STEPS: PropertyTutorialStep[] = [
  {
    id: "welcome-property",
    targetSelector: null,
    title: "Let's look at Property tracking 🔧",
    body: "We've added one example below — a rooftop HVAC unit — so you can see exactly how everything works before you add your own. Tap Next to start, or Skip tour to explore on your own.",
  },
  {
    id: "property-sync-actions",
    targetSelector: '[data-tutorial="property-sync-actions"]',
    title: "Syncs to its own tab, same sheet",
    body: "Once Google Sheets is connected from the Account panel, Property gets its own \"Property\" tab on that same spreadsheet — Push sends this device's list there, Pull brings it back.",
  },
  {
    id: "add-property",
    targetSelector: '[data-tutorial="add-property-button"]',
    title: "Add your own whenever you're ready",
    body: "This button opens a short form — name, location, serial number, and notes — for anything you want to track going forward.",
  },
  {
    id: "example-property",
    targetSelector: '[data-tutorial="tutorial-example-property"]',
    title: "This one's just a sample",
    body: "“Example: Rooftop HVAC Unit” is a stand-in for anything you track — a vehicle, an appliance, a unit in a building. Delete it with the trash icon whenever you're ready to add your own.",
  },
  {
    id: "health-rollup",
    targetSelector: '[data-tutorial="tutorial-example-health"]',
    title: "One line tells you what needs attention",
    body: "This line always shows what's open on a property, so you don't have to open every one just to check. Right now it's flagging one overdue part.",
  },
  {
    id: "example-edit",
    targetSelector: '[data-tutorial="tutorial-example-edit"]',
    title: "Edit the details any time",
    body: "Tap Edit to update a property's name, location, serial number, or notes — nothing here is locked in once it's added.",
  },
  {
    id: "ordered-part",
    targetSelector: '[data-tutorial="tutorial-example-part"]',
    title: "Every part gets its own line",
    body: "Description, price, quantity, and status — all in one place. This one's a fan motor that's been ordered but hasn't shown up yet.",
  },
  {
    // Targets the whole row (same selector as "ordered-part" above), not
    // just the receipt icon — the quantity field and "Log receipt" button
    // that appear once you tap the icon render inside this row, and the
    // overlay only lets clicks through inside its spotlighted element. If
    // this only spotlighted the icon, the row would grow past the hole the
    // instant the panel opened and those controls would sit unclickable
    // under the dimmed backdrop.
    id: "log-receipt",
    targetSelector: '[data-tutorial="tutorial-example-part"]',
    title: "Try logging a receipt",
    body: "Ordered 2, received 0 so far. Tap the package icon in this row, then log 1 as received — I'll wait right here.",
  },
  {
    id: "example-status-dropdown",
    targetSelector: '[data-tutorial="tutorial-example-status-dropdown"]',
    title: "Or just set the status directly",
    body: "Logging a receipt isn't the only way to move a part along — this dropdown lets you jump straight to Ordered, Shipped, Received, Installed, or Cancelled whenever that's a better fit.",
  },
  {
    id: "eta-overdue",
    targetSelector: '[data-tutorial="tutorial-example-eta"]',
    title: "Never lose track of a late delivery",
    body: "Set an expected date on any part, and it turns red the moment it's running late — no need to check back and do the math yourself.",
  },
  {
    id: "task-link",
    targetSelector: '[data-tutorial="tutorial-example-task-link"]',
    title: "Link a part to the job it's for",
    body: "Ordering a part for a specific repair? Tie it to that task so nobody has to guess what it was for later.",
  },
  {
    id: "example-add-part",
    targetSelector: '[data-tutorial="tutorial-example-add-part"]',
    title: "Add a part right from here",
    body: "Type or scan a part number to look it up, or just fill in the description yourself — quantity, price, and an expected delivery date are all optional.",
  },
  {
    id: "status-history",
    targetSelector: '[data-tutorial="tutorial-example-history-button"]',
    title: "See the full story, any time",
    body: "Tap the clock icon to see every status change, timestamped, with who made it — handy when more than one person works on the same property.",
  },
  {
    id: "example-add-task",
    targetSelector: '[data-tutorial="tutorial-example-add-task"]',
    title: "Track maintenance the same way",
    body: "Type a repair or maintenance job here and hit enter to add it to the list — its own status and history work exactly like an ordered part's.",
  },
  {
    id: "replay-tour",
    targetSelector: '[data-tutorial="property-replay-tour"]',
    title: "Come back to this tour any time",
    body: "This link brings this exact walkthrough back whenever you want a refresher.",
  },
  {
    id: "wrap-up",
    targetSelector: '[data-tutorial="tutorial-example-delete"]',
    title: "That's Property tracking!",
    // Narration no longer says "Tap Finish tour": that control is gone, and
    // this HUD now closes with the plain X in its corner. Telling a customer
    // to tap a button that isn't on screen is worse than saying nothing,
    // because they'll stop and hunt for it. NOTE: wrap-up.mp3 is one of the
    // existing recordings and still speaks the old line - it needs
    // re-recording from this text before the fix is actually audible.
    body: "Delete the example with this icon whenever you're ready, then add your own. When you're done, close this with the X up in the corner.",
    nextLabel: "Finish tour",
  },
];

// Stable ids for the seeded example so both PropertyManager.tsx (to attach
// the data-tutorial hooks above) and PropertyTutorialOverlay.tsx (to watch
// the example part's own quantityReceived, for the self-resolving receipt
// step) can point at exactly the same records without guessing.
export const EXAMPLE_PROPERTY_ID = "prop-tutorial-example";
export const EXAMPLE_PART_ID = "part-tutorial-example";
export const EXAMPLE_TASK_ID = "task-tutorial-example";

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Builds the one example property the tour spotlights, fully formed with a
// part and a task already in a state that demonstrates all four things the
// tour explains (open/overdue rollup, quantity due-in vs received, an
// overdue ETA, and a part linked to a task) without the customer having to
// set any of that up themselves first. Called fresh each time the tour
// starts (first visit, or "Take the tour" replay) rather than stored as a
// static constant, so the ETA is always genuinely 5 days overdue relative
// to *today*, not whenever this file was written.
export function buildExampleProperty(): PropertyItem {
  const now = new Date().toISOString();
  const editor = getEditorName() ?? undefined;
  return {
    id: EXAMPLE_PROPERTY_ID,
    name: "Example: Rooftop HVAC Unit",
    location: "Building B Roof",
    notes: "This is a sample so you can see how Property tracking works — delete it anytime with the trash icon above.",
    orderedParts: [
      {
        id: EXAMPLE_PART_ID,
        description: "Condenser Fan Motor, 1/4 HP",
        unit: "ea",
        pricePerUnit: 184.5,
        quantityOrdered: 2,
        quantityReceived: 0,
        estimatedDeliveryDate: daysAgoStr(5),
        maintenanceTaskId: EXAMPLE_TASK_ID,
        status: "ordered",
        updatedAt: now,
        statusHistory: [{ status: "ordered", at: now, by: editor }],
      },
    ],
    maintenanceTasks: [
      {
        id: EXAMPLE_TASK_ID,
        description: "Replace worn fan belt",
        status: "needed",
        updatedAt: now,
        statusHistory: [{ status: "needed", at: now, by: editor }],
      },
    ],
    updatedAt: now,
    lastEditedBy: editor,
  };
}
