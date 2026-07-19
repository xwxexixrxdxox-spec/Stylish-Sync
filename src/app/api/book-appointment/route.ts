import { NextRequest, NextResponse } from "next/server";
import { getOpenSlots, claimSlots, isValidTimeZone } from "@/lib/booking";
import { sendOwnerNotification, sendCustomerConfirmation } from "@/lib/email";
import { isRateLimited } from "@/lib/rateLimit";
import { ContactMethod, isBookingDuration, BOOKING_WINDOW_START, BOOKING_WINDOW_END } from "@/lib/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const CONTACT_METHODS: ContactMethod[] = ["email", "phone", "text"];
const MAX_TEXT_LEN = 2000;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
const WINDOW_START_MIN = toMinutes(BOOKING_WINDOW_START);
const WINDOW_END_MIN = toMinutes(BOOKING_WINDOW_END);
// Fallback only for the rare case a browser doesn't report a usable
// Intl timezone — real submissions always send one (see book_appointment
// page.tsx), this just keeps a booking from being rejected outright over it.
const FALLBACK_TIMEZONE = "America/New_York";

// Public — no auth. Returns the currently-open 1-hour slots (owner's
// declared availability minus anything already booked), so the booking
// page can render a calendar.
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`book-slots:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Slow down a bit." }, { status: 429 });
  }
  try {
    const slots = await getOpenSlots();
    return NextResponse.json({ slots });
  } catch (e) {
    return NextResponse.json({ slots: [], error: "Couldn't load availability right now." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`book-submit:${ip}`, 10, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Slow down a bit." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const date = String(body.date ?? "");
  const start = String(body.start ?? "");
  const hours = Number(body.hours ?? 0);
  const name = String(body.name ?? "").trim().slice(0, 200);
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const contactMethod = String(body.contactMethod ?? "") as ContactMethod;
  const notes = String(body.notes ?? "").trim().slice(0, MAX_TEXT_LEN);
  const requestedTimezone = String(body.timezone ?? "").trim();
  const timezone = requestedTimezone && isValidTimeZone(requestedTimezone) ? requestedTimezone : FALLBACK_TIMEZONE;

  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(start)) {
    return NextResponse.json({ ok: false, error: "Invalid date or time." }, { status: 400 });
  }
  if (!isBookingDuration(hours)) {
    return NextResponse.json({ ok: false, error: "Invalid duration." }, { status: 400 });
  }
  const startMin = toMinutes(start);
  if (startMin < WINDOW_START_MIN || startMin + hours * 60 > WINDOW_END_MIN) {
    return NextResponse.json(
      { ok: false, error: `Visits can only be scheduled between ${BOOKING_WINDOW_START} and ${BOOKING_WINDOW_END}.` },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ ok: false, error: "Phone number is required." }, { status: 400 });
  }
  if (!CONTACT_METHODS.includes(contactMethod)) {
    return NextResponse.json({ ok: false, error: "Pick a preferred contact method." }, { status: 400 });
  }

  try {
    const result = await claimSlots(date, start, hours, { name, email, phone, contactMethod, notes, timezone });
    if (!result.ok || !result.bookingId || !result.cancelToken) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }

    const emailDetails = { date, start, hours, name, email, phone, contactMethod, notes };
    // Best-effort — a booking is still valid even if an email hiccups, so
    // these aren't allowed to fail the request.
    await Promise.allSettled([
      sendOwnerNotification(emailDetails),
      sendCustomerConfirmation({ ...emailDetails, bookingId: result.bookingId, cancelToken: result.cancelToken }),
    ]);

    return NextResponse.json({ ok: true, bookingId: result.bookingId, cancelToken: result.cancelToken });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Couldn't reach the booking system right now. Please try again shortly." },
      { status: 503 }
    );
  }
}
