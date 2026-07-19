import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCookieValue, ADMIN_SESSION_COOKIE_NAME } from "@/lib/session";
import { setBookingArchived } from "@/lib/booking";

// Admin-only — toggles a booking's archived flag so legitimately completed
// jobs can be tucked off the default /admin/visits list without being
// deleted (see setBookingArchived's comment in booking.ts).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!verifyAdminCookieValue(req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const archived = Boolean(body.archived);

  try {
    const result = await setBookingArchived(params.id, archived);
    return NextResponse.json({ ok: result.ok, record: result.record, error: result.error }, { status: result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't reach the booking database." }, { status: 503 });
  }
}
