import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCookieValue, ADMIN_SESSION_COOKIE_NAME } from "@/lib/session";
import { cancelBooking } from "@/lib/booking";
import { sendCustomerCancellationNotice } from "@/lib/email";

export async function POST(req: NextRequest) {
  if (!verifyAdminCookieValue(req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ ok: false, error: "Missing booking id." }, { status: 400 });

  try {
    const result = await cancelBooking(id, "", { skipTokenCheck: true });
    if (result.ok && result.record) {
      await sendCustomerCancellationNotice(result.record);
    }
    return NextResponse.json({ ok: result.ok, error: result.error }, { status: result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't reach the booking database." }, { status: 503 });
  }
}
