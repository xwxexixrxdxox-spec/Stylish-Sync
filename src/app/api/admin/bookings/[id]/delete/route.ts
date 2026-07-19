import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCookieValue, ADMIN_SESSION_COOKIE_NAME } from "@/lib/session";
import { deleteBooking } from "@/lib/booking";

// Admin-only hard delete — for mistaken/duplicate booking entries, at any
// status (including "finished"). Distinct from cancel-booking, which is
// for a customer's genuinely cancelled request and sends them a heads-up
// email; this is purely an administrative correction and stays silent.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!verifyAdminCookieValue(req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  try {
    const result = await deleteBooking(params.id);
    return NextResponse.json({ ok: result.ok, error: result.error }, { status: result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't reach the booking database." }, { status: 503 });
  }
}
