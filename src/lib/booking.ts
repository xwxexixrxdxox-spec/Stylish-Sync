import { getRedis } from "./redis";
import { AvailabilityWindow, OpenSlot, BookingRecord, VisitStatus, PublicBookingStatus } from "./types";

// Storage layer for the in-person visit booking flow, backed by the same
// shared Redis instance already used for the crowdsourced barcode lookup
// (see redis.ts / community-lookup route) - no new infrastructure needed
// beyond REDIS_URL, which this deployment already requires for that
// feature to work.
//
// Keys used:
//   visit:availability          -> JSON array of AvailabilityWindow, set by
//                                   the owner from /admin
//   visit:booked:{date}:{start} -> JSON BookingRecord, one per claimed
//                                   1-hour slot. Claimed with SET NX so two
//                                   simultaneous requests can't both win the
//                                   same hour (same first-write-wins pattern
//                                   as the community barcode database).
//   visit:bookings:index        -> Redis list of booking IDs, newest last,
//                                   purely so /admin can show "who's
//                                   requested a visit" without scanning all
//                                   keys.
//
// This is intentionally simple (no transactions across a multi-hour claim
// beyond a best-effort rollback below) - fine for a single-person local
// service business taking a handful of requests a week, not built to
// survive high concurrent load.

const AVAILABILITY_KEY = "visit:availability";
const BOOKING_INDEX_KEY = "visit:bookings:index";
const SLOT_MINUTES = 60;
const LOOKAHEAD_DAYS = 30; // safety cap even though windows are only ever entered ~2-3 weeks out

function bookedKey(date: string, start: string): string {
  return `visit:booked:${date}:${start}`;
}

function bookingKey(id: string): string {
  return `visit:booking:${id}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Bookings created before visitStatus/statusUpdatedAt/cancelToken existed
// are still sitting in Redis without them — always parse through this
// rather than a bare JSON.parse, so an old record doesn't silently break
// the admin UI (missing status badge, no clock-in button, etc.) or the
// cancel flow (missing cancelToken).
function parseBookingRecord(raw: string): BookingRecord {
  const record = JSON.parse(raw) as BookingRecord;
  return {
    ...record,
    cancelToken: record.cancelToken ?? "",
    visitStatus: record.visitStatus ?? "not_started",
    statusUpdatedAt: record.statusUpdatedAt ?? record.bookedAt,
  };
}

export async function getAvailabilityWindows(): Promise<AvailabilityWindow[]> {
  const redis = await getRedis();
  const raw = await redis.get(AVAILABILITY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setAvailabilityWindows(windows: AvailabilityWindow[]): Promise<void> {
  const redis = await getRedis();
  await redis.set(AVAILABILITY_KEY, JSON.stringify(windows));
}

// Expands the owner's declared windows into discrete 1-hour slots, drops
// anything in the past or beyond LOOKAHEAD_DAYS, and filters out slots
// that already have a booking.
export async function getOpenSlots(): Promise<OpenSlot[]> {
  const windows = await getAvailabilityWindows();
  const redis = await getRedis();

  const now = new Date();
  const cutoff = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const candidates: OpenSlot[] = [];
  for (const w of windows) {
    const windowDate = new Date(`${w.date}T00:00:00`);
    if (Number.isNaN(windowDate.getTime()) || windowDate > cutoff) continue;

    const startMin = toMinutes(w.start);
    const endMin = toMinutes(w.end);
    for (let m = startMin; m + SLOT_MINUTES <= endMin; m += SLOT_MINUTES) {
      const slotStart = toHHMM(m);
      const slotEnd = toHHMM(m + SLOT_MINUTES);
      const slotDateTime = new Date(`${w.date}T${slotStart}:00`);
      if (slotDateTime < now) continue; // already passed
      candidates.push({ date: w.date, start: slotStart, end: slotEnd });
    }
  }

  if (candidates.length === 0) return [];

  // Batch-check which candidate slots are already booked.
  const keys = candidates.map((c) => bookedKey(c.date, c.start));
  const existing = await Promise.all(keys.map((k) => redis.exists(k)));
  return candidates.filter((_, i) => existing[i] === 0).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

export interface ClaimResult {
  ok: boolean;
  bookingId?: string;
  cancelToken?: string;
  error?: string;
}

// Atomically claims `hours` consecutive 1-hour slots starting at
// date/start. Uses SET NX per slot (first-write-wins); if any slot in the
// range is already taken, rolls back the ones that succeeded and reports
// a conflict rather than leaving a partial booking.
export async function claimSlots(
  date: string,
  start: string,
  hours: number,
  details: Omit<BookingRecord, "id" | "date" | "start" | "hours" | "bookedAt" | "cancelToken" | "visitStatus" | "statusUpdatedAt">
): Promise<ClaimResult> {
  const redis = await getRedis();
  const startMin = toMinutes(start);
  const slotStarts: string[] = [];
  for (let i = 0; i < hours; i++) {
    slotStarts.push(toHHMM(startMin + i * SLOT_MINUTES));
  }

  const id = crypto.randomUUID();
  const cancelToken = crypto.randomUUID();
  const record: BookingRecord = {
    id,
    date,
    start,
    hours,
    bookedAt: new Date().toISOString(),
    cancelToken,
    visitStatus: "not_started",
    statusUpdatedAt: new Date().toISOString(),
    ...details,
  };
  const payload = JSON.stringify(record);

  const claimed: string[] = [];
  for (const slotStart of slotStarts) {
    const key = bookedKey(date, slotStart);
    const result = await redis.set(key, payload, { NX: true });
    if (result === "OK") {
      claimed.push(key);
    } else {
      // Conflict — roll back whatever we already claimed in this attempt.
      if (claimed.length) await Promise.all(claimed.map((k) => redis.del(k)));
      return { ok: false, error: "That time was just booked by someone else — please pick another." };
    }
  }

  await redis.set(bookingKey(id), payload);
  await redis.rPush(BOOKING_INDEX_KEY, id);
  return { ok: true, bookingId: id, cancelToken };
}

// Deliberately NOT filtered to "hasn't happened yet" — the admin needs to
// see (and clock in/out/finish) a visit that's currently in progress or
// just wrapped up, not just ones still in the future. Cancelled bookings
// are already gone from the index (cancelBooking removes them), so
// everything here is either upcoming, in progress, or finished.
export async function listBookings(limit = 100): Promise<BookingRecord[]> {
  const redis = await getRedis();
  const ids = await redis.lRange(BOOKING_INDEX_KEY, -limit, -1);
  if (!ids.length) return [];
  const raw = await Promise.all(ids.map((id) => redis.get(bookingKey(id))));
  const records = raw.filter((r): r is string => !!r).map((r) => parseBookingRecord(r));
  return records.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

// Lets a customer find their own booking by the email they booked with,
// instead of needing the id/link from their confirmation email — used by
// the "Track your booking status" flow. Only ever returns the single most
// relevant booking (not a list), and callers should only expose the id from
// it, never the full record: an email address is guessable/known in a way
// an unguessable booking id isn't, so this is intentionally a narrower
// trust boundary than the id-based public status page.
//
// "Most relevant" = whatever the customer would actually want to see: a
// visit currently in progress first, else the soonest upcoming one, else
// the most recently finished one.
export async function findActiveBookingForEmail(email: string): Promise<BookingRecord | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  const all = await listBookings();
  const matches = all.filter((b) => b.email.trim().toLowerCase() === target);
  if (!matches.length) return null;

  const inProgress = matches.find((b) => b.visitStatus === "clocked_in" || b.visitStatus === "on_break");
  if (inProgress) return inProgress;

  const upcoming = matches
    .filter((b) => b.visitStatus === "not_started")
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
  if (upcoming) return upcoming;

  const finished = matches
    .filter((b) => b.visitStatus === "finished")
    .sort((a, b) => b.statusUpdatedAt.localeCompare(a.statusUpdatedAt))[0];
  return finished ?? null;
}

export async function getBooking(id: string): Promise<BookingRecord | null> {
  const redis = await getRedis();
  const raw = await redis.get(bookingKey(id));
  return raw ? parseBookingRecord(raw) : null;
}

// Stripped-down view for the public, token-less status page — see
// PublicBookingStatus's own comment for why these specific fields.
export function toPublicStatus(record: BookingRecord): PublicBookingStatus {
  const { id, name, date, start, hours, visitStatus, statusUpdatedAt } = record;
  return { id, name, date, start, hours, visitStatus, statusUpdatedAt };
}

// Admin-only (route enforces the cookie check) — moves a visit through
// not_started -> clocked_in -> on_break/clocked_in -> finished. No
// validation of *which* transitions are legal here; the admin UI only
// exposes the sensible next steps, and a technician correcting a
// mis-click is a reasonable thing to allow.
export async function updateVisitStatus(id: string, status: VisitStatus): Promise<BookingMutationResult> {
  const redis = await getRedis();
  const raw = await redis.get(bookingKey(id));
  if (!raw) return { ok: false, error: "That booking no longer exists." };

  const record = parseBookingRecord(raw);
  record.visitStatus = status;
  record.statusUpdatedAt = new Date().toISOString();
  await redis.set(bookingKey(id), JSON.stringify(record));
  return { ok: true, record };
}

export interface BookingMutationResult {
  ok: boolean;
  record?: BookingRecord;
  error?: string;
}

// Cancels a booking, freeing up every hour-slot it claimed. Two callers:
//  - the customer, via a link in their confirmation email — must supply
//    the matching cancelToken, since they never authenticate.
//  - the admin screen, already gated behind the admin cookie — passes
//    skipTokenCheck instead, since re-deriving/exposing the token there
//    would be pointless (the admin can already see/cancel everything).
export async function cancelBooking(
  id: string,
  token: string,
  opts?: { skipTokenCheck?: boolean }
): Promise<BookingMutationResult> {
  const redis = await getRedis();
  const raw = await redis.get(bookingKey(id));
  if (!raw) return { ok: false, error: "That request no longer exists — it may already be cancelled." };

  const record = parseBookingRecord(raw);
  if (!opts?.skipTokenCheck && record.cancelToken !== token) {
    return { ok: false, error: "That cancel link isn't valid." };
  }

  const startMin = toMinutes(record.start);
  const slotKeys = Array.from({ length: record.hours }, (_, i) => bookedKey(record.date, toHHMM(startMin + i * SLOT_MINUTES)));
  await Promise.all(slotKeys.map((k) => redis.del(k)));
  await redis.del(bookingKey(id));
  await redis.lRem(BOOKING_INDEX_KEY, 0, id);

  return { ok: true, record };
}
