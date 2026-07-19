import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCookieValue, ADMIN_SESSION_COOKIE_NAME } from "@/lib/session";
import { getAvailabilityWindows, setAvailabilityWindows, listUpcomingBookings } from "@/lib/booking";
import { AvailabilityWindow } from "@/lib/types";

function isAdmin(req: NextRequest): boolean {
  return verifyAdminCookieValue(req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

const MAX_WINDOWS = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function isValidWindow(w: any): w is AvailabilityWindow {
  return (
    w &&
    typeof w.date === "string" &&
    DATE_PATTERN.test(w.date) &&
    typeof w.start === "string" &&
    TIME_PATTERN.test(w.start) &&
    typeof w.end === "string" &&
    TIME_PATTERN.test(w.end) &&
    w.start < w.end
  );
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  try {
    const [windows, bookings] = await Promise.all([getAvailabilityWindows(), listUpcomingBookings()]);
    return NextResponse.json({ ok: true, windows, bookings });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Couldn't reach the booking database." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const windows = Array.isArray(body.windows) ? body.windows : null;

  if (!windows || windows.length > MAX_WINDOWS || !windows.every(isValidWindow)) {
    return NextResponse.json({ ok: false, error: "Invalid availability windows." }, { status: 400 });
  }

  try {
    await setAvailabilityWindows(windows);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Couldn't reach the booking database." }, { status: 503 });
  }
}
