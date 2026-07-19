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
// All dates/times below are plain "YYYY-MM-DD" / "HH:MM" strings in the
// business owner's own local time (no timezone conversion) - this is a
// single-person, single-timezone local service business, so that keeps
// things simple rather than dragging in a timezone library.

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

// Lifecycle of the on-site visit itself, separate from the booking
// request lifecycle above. Driven entirely by the admin (the technician
// doing the visit); the customer-facing status page just reflects it.
export type VisitStatus = "not_started" | "clocked_in" | "on_break" | "finished";

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
  // Random secret the customer needs (alongside id) to cancel their own
  // request without logging in — mailed to them in the confirmation email
  // and handed back once from the booking API response. The admin side
  // cancels by id alone (already behind the admin cookie), so this never
  // needs to leave the server for admin use.
  cancelToken: string;
  visitStatus: VisitStatus;
  statusUpdatedAt: string;
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
}
