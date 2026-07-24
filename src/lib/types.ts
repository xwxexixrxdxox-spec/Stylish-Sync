export type Unit =
  | "ea"
  | "box"
  | "case"
  | "pack"
  | "bag"
  | "bottle"
  | "can"
  | "roll"
  | "dozen"
  | "pair"
  | "kg"
  | "lb"
  | "oz"
  | "g"
  | "L"
  | "ml"
  | "fl oz"
  | string;

export interface InventoryItem {
  id: string;
  barcode: string;
  name: string;
  quantity: number;
  unit: Unit;
  pricePerUnit: number;
  reorderAt: number;
  updatedAt: string;
  location?: string;
  // If this item is a case/pack that gets broken down into a separate,
  // individually-tracked each-level item (e.g. a 12-pack case of cans that
  // gets unpacked onto a shelf as loose cans), these two fields describe
  // that relationship. Only ever set on the case/pack side — the each item
  // itself carries no back-reference. Keyed by the *other* item's barcode
  // rather than its id: an id is only ever stable on the device that
  // generated it, while every other cross-device path in this app (scan
  // add/remove, bulk import) already identifies "the same item" by
  // barcode, so this is what actually survives an import or a second
  // device rather than silently pointing at nothing.
  breaksDownIntoBarcode?: string;
  // How many of the linked each-item one unit of *this* item yields when
  // broken down (e.g. 12).
  breaksDownIntoQty?: number;
  // Which usage-history window (UsageTab.tsx) this specific item should
  // open to whenever it's picked from the Usage tab's item dropdown, rather
  // than always landing on the app's blanket 30-day default. A fast-moving
  // item and one that's only restocked a couple times a year don't want the
  // same default lens, and re-clicking the range picker every time you
  // switch to a particular item gets old. Undefined (the case for every
  // item that existed before this field shipped, and any new one where the
  // customer hasn't set a preference) just means "use the app default" —
  // nothing about existing stored items changes on its own.
  usageTrackingDays?: UsageRangeValue;
}

// Shared between UsageTab.tsx (the range-picker buttons) and
// ItemEditModal.tsx (the per-item default above) so both stay in sync on
// what values are actually valid — "all" is span-based (from the earliest
// recorded movement) rather than a fixed day count, which is why this
// isn't just `number`.
export type UsageRangeValue = 7 | 14 | 30 | 90 | 365 | "all";

export const USAGE_RANGE_OPTIONS: { label: string; value: UsageRangeValue }[] = [
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "1y", value: 365 },
  { label: "All", value: "all" },
];

export interface StockMovement {
  id: string;
  itemId: string;
  delta: number;
  // "usage-import" is distinct from "import" (which means the customer
  // bulk-overwrote inventory quantities) — this one specifically means
  // "the customer told us about usage that happened before/outside this
  // app," so the two never get conflated when reviewing usage history.
  // "break-case" is logged twice per break (a negative delta on the case
  // item, a positive delta on the each item) — see breakCase in page.tsx.
  // The case side is deliberately logged as real removed stock (not a
  // no-op transfer) so its own reorder threshold and usage history reflect
  // that cases actually left the "still sealed" count, per the customer's
  // explicit ask.
  reason: "scan-add" | "scan-remove" | "manual-adjust" | "import" | "usage-import" | "break-case";
  at: string;
}

// EXPERIMENTAL — see PackageTracking below for what "experimental" means
// here specifically. Kept as its own type (rather than folded into
// InventoryItem) the same way StockMovement is: a parallel, itemId-keyed
// array, since one item can plausibly have more than one package in
// flight (a second reorder placed before the first arrives).
export type Carrier = "amazon" | "ups" | "fedex" | "usps";

export const CARRIER_OPTIONS: { label: string; value: Carrier }[] = [
  { label: "Amazon", value: "amazon" },
  { label: "UPS", value: "ups" },
  { label: "FedEx", value: "fedex" },
  { label: "USPS", value: "usps" },
];

// EXPERIMENTAL: a customer-entered tracking number logged against a
// reorder, purely so the Reorder tab can show "you already ordered this"
// and hand back a link to the carrier's own public tracking page. This is
// deliberately NOT live package-status polling — there's no carrier API
// integration behind it (Amazon in particular has no public consumer
// tracking API at all, same limitation already noted on the "Find on
// Amazon" search link in ReorderTab.tsx), so nothing here ever tells you
// a package shipped, is out for delivery, or arrived on its own; it just
// remembers the number and the same link a customer would look up by
// hand. Shown with an "Experimental" label in the UI until real usage
// shows whether a manual log like this is actually useful as-is, or
// whether it's worth the added complexity of real carrier-status
// integration later.
export interface PackageTracking {
  id: string;
  itemId: string; // the InventoryItem this package was ordered for
  carrier: Carrier;
  trackingNumber: string;
  addedAt: string; // ISO
  // Customer marked this as no longer relevant (received, cancelled,
  // entered wrong) without permanently deleting the record outright —
  // mainly so there's room for an "undo" later if that turns out to
  // matter; storage.ts still caps total records the same way movements
  // are capped, so this isn't unbounded growth either way.
  dismissed?: boolean;
}

export type SupportAccessState = "unknown" | "locked" | "unlocked";

export interface AccessCheckResponse {
  access: boolean;
  plan?: string | null;
  currentPeriodEnd?: string | null;
  reason?: string;
}

// --- In-person visit booking -----------------------------------------
// `date`/`start` below are plain "YYYY-MM-DD" / "HH:MM" strings meant to be
// read as wall-clock time in the booking's own `timezone` field (captured
// from the customer's browser at booking time) — this used to be "the
// business owner's local time, no timezone conversion" for a single-person,
// single-timezone business, but the clock-in/out grace-window rule below
// needs to be judged against wherever the visit is actually happening, so
// every booking now carries its own zone rather than assuming one globally.

export interface AvailabilityWindow {
  date: string; // "YYYY-MM-DD"
  start: string; // "HH:MM", 24h
  end: string; // "HH:MM", 24h
}

export type ContactMethod = "email" | "phone" | "text";

export interface OpenSlot {
  date: string;
  start: string;
  end: string;
}

// Visits are booked in fixed-length blocks rather than an arbitrary 1-12
// hour number, both so pricing stays predictable and so the mandated-break
// table below (BREAK_REQUIRED_MINUTES) has a fixed, known set of tiers to
// key off of.
export const BOOKING_DURATIONS = [3, 5, 8, 10, 12] as const;
export type BookingDuration = (typeof BOOKING_DURATIONS)[number];

export function isBookingDuration(n: number): n is BookingDuration {
  return (BOOKING_DURATIONS as readonly number[]).includes(n);
}

// Minutes of break time Kentucky law requires be made available before a
// visit of this length can be marked finished — this is a floor the
// technician is entitled to, not a cap on how much break they can take.
// Derived from the business owner's stated rule: every 5 hours worked
// entitles the technician to 30 minutes (two 15s or one 30); at 8 hours
// that's 60 minutes (two 15s + a 30, or one 60); at 12 hours it's 120
// minutes (two 30s + an hour). 3-hour visits fall under the 5-hour
// threshold the rule was stated against, so nothing is enforced there.
// 10-hour visits sit between the 8 and 12-hour tiers with no explicit rule
// given — this uses the 8-hour tier's 60-minute floor as a conservative
// placeholder rather than silently guessing something stricter; flagged to
// the business owner to confirm.
export const BREAK_REQUIRED_MINUTES: Record<BookingDuration, number> = {
  3: 0,
  5: 30,
  8: 60,
  10: 60,
  12: 120,
};

// Grace window (minutes) around a visit's scheduled start within which a
// clock-in is allowed. Federal law allows up to 15 minutes early/late;
// Kentucky's own rule is tighter at 7 minutes. This app enforces the
// stricter of the two everywhere, so it's never less compliant than either
// law taken alone. Only the "too early" side is actually enforced as a hard
// block (see updateVisitStatus in booking.ts) — a late clock-in is still
// allowed through, since refusing it would permanently strand a visit with
// no way to ever be completed.
export const CLOCK_IN_GRACE_MINUTES = 7;

// Hard cap on a single visit's clocked-in duration — the technician is
// force-clocked-out once this many real hours have elapsed since clock-in,
// regardless of the booking's scheduled length or how it's going.
export const FORCED_CLOCKOUT_HOURS = 12;

// No visit may start before, or run past, these clock times — bookings
// outside this window simply aren't offered/allowed, regardless of what
// availability window the admin declares.
export const BOOKING_WINDOW_START = "07:00";
export const BOOKING_WINDOW_END = "21:00";

// Kentucky law: a work week can't exceed 40 hours without overtime, and
// since this business doesn't pay overtime, the technician simply can't be
// clocked in for more than this in a single week. A work week runs
// Sunday through Saturday (the business owner's own stated definition).
export const WEEKLY_HOUR_CAP = 40;

// Timezone used only to compute the Sunday-Saturday work-week boundary for
// the 40-hour cap above — a business-level payroll concept, so it uses one
// fixed zone for every booking regardless of where each individual
// customer is, unlike CLOCK_IN_GRACE_MINUTES (which judges each visit
// against its own customer's timezone). This is a placeholder pointed at
// the business's actual home timezone; flagged for the owner to confirm
// since Kentucky itself spans Eastern and Central time.
export const BUSINESS_TIMEZONE = "America/New_York";

// Lifecycle of the on-site visit itself, separate from the booking
// request lifecycle above. Driven entirely by the admin (the technician
// doing the visit); the customer-facing status page just reflects it.
export type VisitStatus = "not_started" | "clocked_in" | "on_break" | "finished";

// A single break window during a visit. `minutes` is the actual elapsed
// length, filled in once the break ends (on resume, or when the visit is
// finished directly from an in-progress break) — not whatever nominal
// length the technician may have had in mind when they tapped "Take a
// break". `end` is null while the break is still in progress.
export interface BreakRecord {
  start: string; // ISO timestamp
  end: string | null; // ISO timestamp, null while on break
  minutes: number;
}

export interface BookingRecord {
  id: string;
  date: string;
  start: string;
  hours: number;
  name: string;
  email: string;
  phone: string;
  contactMethod: ContactMethod;
  notes: string;
  bookedAt: string;
  // IANA zone (e.g. "America/Kentucky/Louisville"), captured from the
  // customer's browser when they booked. Used to judge the clock-in grace
  // window against wherever the visit is actually happening — Kentucky
  // itself straddles Eastern and Central time, so a single hard-coded zone
  // for the whole business wouldn't be reliably correct.
  timezone: string;
  // Random secret the customer needs (alongside id) to cancel their own
  // request without logging in — mailed to them in the confirmation email
  // and handed back once from the booking API response. The admin side
  // cancels by id alone (already behind the admin cookie), so this never
  // needs to leave the server for admin use.
  cancelToken: string;
  visitStatus: VisitStatus;
  statusUpdatedAt: string;
  // Real timestamp of the *first* clock-in for this visit (not reset by
  // breaks/resumes) — the reference point for the 12-hour forced clock-out.
  clockInAt: string | null;
  breaks: BreakRecord[];
  // True once the 12-hour cap has force-finished this visit rather than an
  // explicit "Finished" click.
  autoClockedOut: boolean;
  // Tucked out of the default admin list without being deleted — for
  // legitimately completed jobs the owner wants off the active list but
  // still wants a record of. Distinct from actually deleting a booking
  // (see deleteBooking in booking.ts), which is for mistaken/duplicate
  // entries that shouldn't exist at all.
  archived: boolean;
}

// What the public status page (linked from the confirmation email, keyed
// by booking id alone — no token) is allowed to see. Deliberately
// stripped of email/phone/notes/cancelToken since this link isn't
// secret-protected the way the cancel link is.
export interface PublicBookingStatus {
  id: string;
  name: string;
  date: string;
  start: string;
  hours: number;
  visitStatus: VisitStatus;
  statusUpdatedAt: string;
  autoClockedOut: boolean;
}
