import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCookieValue, ADMIN_SESSION_COOKIE_NAME } from "@/lib/session";
import { listBookingsForAdmin } from "@/lib/booking";
import { sendVisitFinishedEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  if (!verifyAdminCookieValue(req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  try {
    const { bookings, justAutoFinished } = await listBookingsForAdmin();
    // Any visit that crossed the 12-hour forced-clock-out cap between the
    // last time someone looked and now gets the same "you're finished, here's
    // how to pay" email an explicit Finished click would have sent — best
    // effort, doesn't fail the list request if it hiccups.
    if (justAutoFinished.length) {
      await Promise.allSettled(justAutoFinished.map((b) => sendVisitFinishedEmail(b)));
    }
    return NextResponse.json({ ok: true, bookings });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't reach the booking database." }, { status: 503 });
  }
}
