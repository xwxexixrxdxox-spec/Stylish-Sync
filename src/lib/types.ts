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
}

export interface StockMovement {
  id: string;
  itemId: string;
  delta: number;
  reason: "scan-add" | "scan-remove" | "manual-adjust" | "import";
  at: string;
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
