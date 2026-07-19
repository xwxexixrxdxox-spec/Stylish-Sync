import { NextRequest, NextResponse } from "next/server";
import { getOpenSlots, claimSlots } from "@/lib/booking";
import { sendOwnerNotification, sendCustomerConfirmation } from "@/lib/email";
import { isRateLimited } from "@/lib/rateLimit";
import { ContactMethod } from "@/lib/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const CONTACT_METHODS: ContactMethod[] = ["email", "phone", "text"];
const MAX_HOURS = 10;
const MAX_TEXT_LEN = 2000;

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
  const hours = Number(body.hours ?? 1);
  const name = String(body.name ?? "").trim().slice(0, 200);
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const contactMethod = String(body.contactMethod ?? "") as ContactMethod;
  const notes = String(body.notes ?? "").trim().slice(0, MAX_TEXT_LEN);

  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(start)) {
    return NextResponse.json({ ok: false, error: "Invalid date or time." }, { status: 400 });
  }
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_HOURS) {
    return NextResponse.json({ ok: false, error: "Invalid duration." }, { status: 400 });
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
    const result = await claimSlots(date, start, hours, { name, email, phone, contactMethod, notes });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }

    const emailDetails = { date, start, hours, name, email, phone, contactMethod, notes };
    // Best-effort — a booking is still valid even if an email hiccups, so
    // these aren't allowed to fail the request.
    await Promise.allSettled([sendOwnerNotification(emailDetails), sendCustomerConfirmation(emailDetails)]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Couldn't reach the booking system right now. Please try again shortly." },
      { status: 503 }
    );
  }
}
