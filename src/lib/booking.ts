import { getRedis } from "./redis";
import {
  AvailabilityWindow,
  OpenSlot,
  BookingRecord,
  BreakRecord,
  VisitStatus,
  PublicBookingStatus,
  BookingDuration,
  BREAK_REQUIRED_MINUTES,
  CLOCK_IN_GRACE_MINUTES,
  FORCED_CLOCKOUT_HOURS,
  BOOKING_WINDOW_START,
  BOOKING_WINDOW_END,
  BOOKING_DURATIONS,
  WEEKLY_HOUR_CAP,
  BUSINESS_TIMEZONE,
} from "./types";

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

// Used only to backfill bookings made before per-booking timezones existed
// — a real (non-guessed) zone is always supplied by the booking form going
// forward. Kentucky itself straddles Eastern/Central, so this is a rough
// fallback for old data, not something new bookings should ever rely on.
const FALLBACK_TIMEZONE = "America/New_York";

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

// Bookings created before visitStatus/statusUpdatedAt/cancelToken/timezone/
// clockInAt/breaks/autoClockedOut existed are still sitting in Redis
// without them — always parse through this rather than a bare JSON.parse,
// so an old record doesn't silently break the admin UI (missing status
// badge, no clock-in button, etc.) or the cancel flow (missing
// cancelToken).
function parseBookingRecord(raw: string): BookingRecord {
  const record = JSON.parse(raw) as BookingRecord;
  return {
    ...record,
    cancelToken: record.cancelToken ?? "",
    visitStatus: record.visitStatus ?? "not_started",
    statusUpdatedAt: record.statusUpdatedAt ?? record.bookedAt,
    timezone: record.timezone || FALLBACK_TIMEZONE,
    clockInAt: record.clockInAt ?? null,
    breaks: Array.isArray(record.breaks) ? record.breaks : [],
    autoClockedOut: record.autoClockedOut ?? false,
    archived: record.archived ?? false,
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

// Expands the owner's declared windows into discrete 1-hour start-time
// slots, drops anything in the past or beyond LOOKAHEAD_DAYS, and filters
// out slots that already have a booking. Start times are still offered on
// the hour — it's just the *duration* a customer picks on top of a start
// time that's now restricted to BOOKING_DURATIONS.
//
// Clamped to [BOOKING_WINDOW_START, BOOKING_WINDOW_END - MIN_DURATION] so
// every candidate slot can support at least the shortest booking
// (BOOKING_DURATIONS[0]) without running past the window — this holds
// regardless of what window the admin actually declared, so a
// too-wide-by-mistake availability window can't leak an unbookable-by-law
// start time into the picker. The final start+duration combo is still
// re-validated server-side at claim time (see claimSlots' caller in the
// booking API route) since duration isn't chosen until after a start time.
export async function getOpenSlots(): Promise<OpenSlot[]> {
  const windows = await getAvailabilityWindows();
  const redis = await getRedis();

  const now = new Date();
  const cutoff = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const windowStartMin = toMinutes(BOOKING_WINDOW_START);
  const windowEndMin = toMinutes(BOOKING_WINDOW_END);
  const minDurationHours = Math.min(...BOOKING_DURATIONS);

  const candidates: OpenSlot[] = [];
  for (const w of windows) {
    const windowDate = new Date(`${w.date}T00:00:00`);
    if (Number.isNaN(windowDate.getTime()) || windowDate > cutoff) continue;

    const startMin = Math.max(toMinutes(w.start), windowStartMin);
    const latestStartMin = Math.min(toMinutes(w.end), windowEndMin - minDurationHours * 60);
    for (let m = startMin; m + SLOT_MINUTES <= toMinutes(w.end) && m <= latestStartMin; m += SLOT_MINUTES) {
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
  hours: BookingDuration,
  details: Omit<
    BookingRecord,
    | "id"
    | "date"
    | "start"
    | "hours"
    | "bookedAt"
    | "cancelToken"
    | "visitStatus"
    | "statusUpdatedAt"
    | "clockInAt"
    | "breaks"
    | "autoClockedOut"
    | "archived"
  >
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
    clockInAt: null,
    breaks: [],
    autoClockedOut: false,
    archived: false,
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

// ---- Timezone-aware scheduling helpers --------------------------------
// No date library is pulled in for this (matches the rest of the app's
// "no new dependency for something this small" posture) — these two
// functions are the standard library-free idiom for converting a wall-clock
// time in an arbitrary IANA zone to a real UTC instant, using Intl (which
// Node already ships with full ICU data for).

function timeZoneOffsetMinutes(timeZone: string, atUtc: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(atUtc);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

// Interprets `date` ("YYYY-MM-DD") + `time` ("HH:MM") as wall-clock time in
// `timeZone`, returning the equivalent real-world instant. Every
// grace-window / forced-clock-out check funnels through this so a
// booking's schedule is judged against wherever the visit is actually
// happening (the customer's own timezone at booking time), not the
// server's or a single hard-coded business timezone.
function zonedDateTime(date: string, time: string, timeZone: string): Date {
  const naiveUtc = new Date(`${date}T${time}:00Z`);
  const offsetMinutes = timeZoneOffsetMinutes(timeZone, naiveUtc);
  return new Date(naiveUtc.getTime() - offsetMinutes * 60_000);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---- Break tracking -----------------------------------------------------

function closeOpenBreak(breaks: BreakRecord[], now: Date): BreakRecord[] {
  const openIdx = breaks.findIndex((b) => b.end === null);
  if (openIdx === -1) return breaks;
  const openStart = new Date(breaks[openIdx].start);
  const minutes = Math.max(0, Math.round((now.getTime() - openStart.getTime()) / 60_000));
  const next = [...breaks];
  next[openIdx] = { ...next[openIdx], end: now.toISOString(), minutes };
  return next;
}

function totalBreakMinutes(breaks: BreakRecord[]): number {
  return breaks.reduce((sum, b) => sum + b.minutes, 0);
}

// Real minutes worked on a visit so far: elapsed time since clock-in
// (through statusUpdatedAt if it's finished, otherwise through now for one
// that's still in progress) minus any break time. Used both by the weekly
// 40-hour cap below and could be reused anywhere else "how much has
// actually been worked" matters — deliberately based on real timestamps,
// not the visit's scheduled `hours`, since that's what an hours cap should
// actually be measuring.
function actualOrInProgressMinutes(record: BookingRecord): number {
  if (!record.clockInAt) return 0;
  const startMs = new Date(record.clockInAt).getTime();
  const endMs = record.visitStatus === "finished" ? new Date(record.statusUpdatedAt).getTime() : Date.now();
  const rawMinutes = Math.max(0, (endMs - startMs) / 60_000);
  return Math.max(0, rawMinutes - totalBreakMinutes(record.breaks));
}

// Sunday 00:00 through the following Sunday 00:00, in BUSINESS_TIMEZONE,
// for whichever week contains `dateStr`. Used only for the 40-hour weekly
// cap — a payroll concept that needs one consistent week boundary across
// every booking, unlike the per-booking customer timezone used elsewhere.
function weekBoundsFor(dateStr: string): { weekStartMs: number; weekEndMs: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Noon UTC anchor avoids any midnight/DST edge case when asking "what
  // weekday is this calendar date in BUSINESS_TIMEZONE".
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  const weekdayName = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIMEZONE, weekday: "short" }).format(noonUtc);
  const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = WEEKDAY_INDEX[weekdayName] ?? 0;

  const sundayUtcNoon = new Date(noonUtc.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
  const sundayDateStr = sundayUtcNoon.toISOString().slice(0, 10);
  const weekStart = zonedDateTime(sundayDateStr, "00:00", BUSINESS_TIMEZONE);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { weekStartMs: weekStart.getTime(), weekEndMs: weekEnd.getTime() };
}

// Defensively force-finishes a visit that's been clocked in for
// FORCED_CLOCKOUT_HOURS or more, regardless of whether anyone has told the
// system to. There's no background job in this app (see the redis.ts /
// architecture notes — everything is computed lazily on read), so this
// takes effect the next time the record is touched (an admin loading
// /admin/visits, the customer's status page polling, or an explicit
// clock-in-out action) rather than the instant the cap is actually hit.
function applyForcedClockOut(record: BookingRecord): { record: BookingRecord; changed: boolean } {
  if (record.visitStatus !== "clocked_in" && record.visitStatus !== "on_break") {
    return { record, changed: false };
  }
  if (!record.clockInAt) return { record, changed: false };

  const elapsedMs = Date.now() - new Date(record.clockInAt).getTime();
  if (elapsedMs < FORCED_CLOCKOUT_HOURS * 60 * 60 * 1000) return { record, changed: false };

  const now = new Date();
  const breaks = record.visitStatus === "on_break" ? closeOpenBreak(record.breaks, now) : record.breaks;
  return {
    record: { ...record, breaks, visitStatus: "finished", statusUpdatedAt: now.toISOString(), autoClockedOut: true },
    changed: true,
  };
}

async function loadAndReconcileBookings(limit: number): Promise<{ records: BookingRecord[]; justForced: BookingRecord[] }> {
  const redis = await getRedis();
  const ids = await redis.lRange(BOOKING_INDEX_KEY, -limit, -1);
  if (!ids.length) return { records: [], justForced: [] };

  const raw = await Promise.all(ids.map((id) => redis.get(bookingKey(id))));
  const records: BookingRecord[] = [];
  const justForced: BookingRecord[] = [];

  for (const r of raw) {
    if (!r) continue;
    const parsed = parseBookingRecord(r);
    const forced = applyForcedClockOut(parsed);
    if (forced.changed) {
      await redis.set(bookingKey(forced.record.id), JSON.stringify(forced.record));
      justForced.push(forced.record);
      records.push(forced.record);
    } else {
      records.push(parsed);
    }
  }

  records.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return { records, justForced };
}

// Deliberately NOT filtered to "hasn't happened yet" — the admin needs to
// see (and clock in/out/finish) a visit that's currently in progress or
// just wrapped up, not just ones still in the future. Cancelled bookings
// are already gone from the index (cancelBooking removes them), so
// everything here is either upcoming, in progress, or finished.
export async function listBookings(limit = 100): Promise<BookingRecord[]> {
  const { records } = await loadAndReconcileBookings(limit);
  return records;
}

// Admin-only variant of listBookings that also surfaces which bookings, if
// any, just crossed the 12-hour forced-clock-out cap during *this* call —
// used by the admin bookings route to send the same "visit finished /
// here's how to pay" email a normal Finished click would trigger. Kept
// separate from the plain listBookings() (which findActiveBookingForEmail
// also calls, from an unauthenticated public endpoint) specifically so an
// anonymous lookup can never be the thing that triggers an email send for
// someone else's unrelated booking.
export async function listBookingsForAdmin(limit = 100): Promise<{ bookings: BookingRecord[]; justAutoFinished: BookingRecord[] }> {
  const { records, justForced } = await loadAndReconcileBookings(limit);
  return { bookings: records, justAutoFinished: justForced };
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
  if (!raw) return null;

  const record = parseBookingRecord(raw);
  const forced = applyForcedClockOut(record);
  if (forced.changed) {
    await redis.set(bookingKey(id), JSON.stringify(forced.record));
    return forced.record;
  }
  return record;
}

// Stripped-down view for the public, token-less status page — see
// PublicBookingStatus's own comment for why these specific fields.
export function toPublicStatus(record: BookingRecord): PublicBookingStatus {
  const { id, name, date, start, hours, visitStatus, statusUpdatedAt, autoClockedOut } = record;
  return { id, name, date, start, hours, visitStatus, statusUpdatedAt, autoClockedOut };
}

export interface BookingMutationResult {
  ok: boolean;
  record?: BookingRecord;
  error?: string;
  // True only when this exact call is the one that force-finished the
  // visit via the 12-hour cap (as opposed to the visit already having been
  // auto-finished by an earlier read) — lets the caller decide whether to
  // fire the "visit finished" email.
  autoFinished?: boolean;
}

// Admin-only (route enforces the cookie check) — moves a visit through
// not_started -> clocked_in -> on_break/clocked_in -> finished, enforcing
// four legal guardrails along the way:
//
//  1. Clock-in grace window: the first clock-in for a visit can't happen
//     more than CLOCK_IN_GRACE_MINUTES before its scheduled start (judged
//     in the customer's own timezone) — this is the actual "admin can't
//     have free reign over their own clock-in time" protection, since
//     that's the direction that could be used to pad billed hours. A late
//     clock-in is allowed through with no upper bound — blocking that
//     would strand the visit with no way to ever be completed.
//  2. Break floor: a visit can't be marked "finished" until at least
//     BREAK_REQUIRED_MINUTES[hours] minutes of break have actually been
//     logged, protecting the technician's break time even on a flat-rate
//     $300/day visit.
//  3. Forced clock-out: a visit clocked in for FORCED_CLOCKOUT_HOURS or
//     more is force-finished before any other transition is considered.
//  4. Weekly hour cap: a clock-in is refused if it would push the
//     technician's total worked hours for their Sunday-Saturday work week
//     (see BUSINESS_TIMEZONE/WEEKLY_HOUR_CAP) over 40 — no overtime here,
//     so this is a hard stop rather than a warning.
//
// Beyond that, no validation of *which* transitions are legal — the admin
// UI only exposes the sensible next steps, and a technician correcting a
// mis-click is a reasonable thing to allow.
export async function updateVisitStatus(id: string, status: VisitStatus): Promise<BookingMutationResult> {
  const redis = await getRedis();
  const raw = await redis.get(bookingKey(id));
  if (!raw) return { ok: false, error: "That booking no longer exists." };

  let record = parseBookingRecord(raw);

  const forced = applyForcedClockOut(record);
  if (forced.changed) {
    record = forced.record;
    await redis.set(bookingKey(id), JSON.stringify(record));
    if (status !== "finished") {
      return {
        ok: false,
        error: "This visit hit the 12-hour legal maximum and was automatically clocked out.",
        record,
        autoFinished: true,
      };
    }
    // The requested status was already "finished" — nothing left to do.
    return { ok: true, record, autoFinished: true };
  }

  const now = new Date();

  if (status === "clocked_in" && record.visitStatus === "not_started") {
    const scheduledStart = zonedDateTime(record.date, record.start, record.timezone);
    const earliestAllowed = new Date(scheduledStart.getTime() - CLOCK_IN_GRACE_MINUTES * 60_000);
    if (now < earliestAllowed) {
      return { ok: false, error: "Sorry, it's too early to clock in. Come back closer to the scheduled time slot." };
    }

    // Kentucky: no overtime means the technician simply can't be clocked in
    // past WEEKLY_HOUR_CAP hours in their Sunday-Saturday work week. Sums
    // real worked minutes (finished visits + anything currently in
    // progress elsewhere, minus breaks) from every other booking that
    // falls in this same week, then adds this visit's scheduled hours as
    // the best available projection since it hasn't happened yet.
    const { weekStartMs, weekEndMs } = weekBoundsFor(record.date);
    const allBookings = await listBookings();
    const alreadyWorkedMinutes = allBookings
      .filter((b) => b.id !== record.id)
      .filter((b) => {
        const anchor = zonedDateTime(b.date, "12:00", BUSINESS_TIMEZONE).getTime();
        return anchor >= weekStartMs && anchor < weekEndMs;
      })
      .reduce((sum, b) => sum + actualOrInProgressMinutes(b), 0);
    const projectedMinutes = alreadyWorkedMinutes + record.hours * 60;
    if (projectedMinutes > WEEKLY_HOUR_CAP * 60) {
      const alreadyWorkedHours = Math.round((alreadyWorkedMinutes / 60) * 10) / 10;
      const remainingHours = Math.max(0, Math.round(((WEEKLY_HOUR_CAP * 60 - alreadyWorkedMinutes) / 60) * 10) / 10);
      return {
        ok: false,
        error: `This would put the technician over the ${WEEKLY_HOUR_CAP}-hour weekly cap (Kentucky law, no overtime) — about ${alreadyWorkedHours}h already worked this week, ${remainingHours}h left. Reschedule or shorten this visit.`,
      };
    }

    record.clockInAt = record.clockInAt ?? now.toISOString();
  }

  if (status === "on_break" && record.visitStatus === "clocked_in") {
    record.breaks = [...record.breaks, { start: now.toISOString(), end: null, minutes: 0 }];
  }

  if (record.visitStatus === "on_break" && (status === "clocked_in" || status === "finished")) {
    record.breaks = closeOpenBreak(record.breaks, now);
  }

  if (status === "finished") {
    const required = BREAK_REQUIRED_MINUTES[record.hours as BookingDuration] ?? 0;
    const taken = totalBreakMinutes(record.breaks);
    if (required > 0 && taken < required) {
      return {
        ok: false,
        error: `Kentucky law requires at least ${required} min of break for a ${record.hours}h visit — only ${taken} min logged so far. Log the technician's break before finishing.`,
        record,
      };
    }
  }

  record.visitStatus = status;
  record.statusUpdatedAt = now.toISOString();
  await redis.set(bookingKey(id), JSON.stringify(record));
  return { ok: true, record };
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

// Admin-only, hard delete of a mistaken/duplicate booking — any status,
// including "finished". Deliberately does NOT send the customer a
// cancellation email the way cancelBooking does: that email says "your
// visit request was cancelled," which is the wrong message for a job that
// may have actually happened and is just being purged as a data-entry
// mistake, or for a finished job being tidied up. Frees the slot(s) the
// same way cancelBooking does so a deleted mistaken entry doesn't leave
// stale hours permanently unbookable.
export async function deleteBooking(id: string): Promise<BookingMutationResult> {
  const redis = await getRedis();
  const raw = await redis.get(bookingKey(id));
  if (!raw) return { ok: false, error: "That booking no longer exists." };

  const record = parseBookingRecord(raw);
  const startMin = toMinutes(record.start);
  const slotKeys = Array.from({ length: record.hours }, (_, i) => bookedKey(record.date, toHHMM(startMin + i * SLOT_MINUTES)));
  await Promise.all(slotKeys.map((k) => redis.del(k)));
  await redis.del(bookingKey(id));
  await redis.lRem(BOOKING_INDEX_KEY, 0, id);

  return { ok: true, record };
}

// Admin-only — tucks a legitimately completed job out of the default
// /admin/visits list (or brings it back) without deleting it. Doesn't free
// the booked slot(s): an archived visit already happened, so there's
// nothing to release.
export async function setBookingArchived(id: string, archived: boolean): Promise<BookingMutationResult> {
  const redis = await getRedis();
  const raw = await redis.get(bookingKey(id));
  if (!raw) return { ok: false, error: "That booking no longer exists." };

  const record = parseBookingRecord(raw);
  record.archived = archived;
  await redis.set(bookingKey(id), JSON.stringify(record));
  return { ok: true, record };
}
