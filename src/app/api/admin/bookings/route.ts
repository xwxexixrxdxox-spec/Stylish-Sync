import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCookieValue, ADMIN_SESSION_COOKIE_NAME } from "@/lib/session";
import { listBookings } from "@/lib/booking";

export async function GET(req: NextRequest) {
  if (!verifyAdminCookieValue(req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  try {
    const bookings = await listBookings();
    return NextResponse.json({ ok: true, bookings });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't reach the booking database." }, { status: 503 });
  }
}
