import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCookieValue, ADMIN_SESSION_COOKIE_NAME } from "@/lib/session";
import { updateVisitStatus } from "@/lib/booking";
import { sendVisitFinishedEmail } from "@/lib/email";
import { VisitStatus } from "@/lib/types";

const VALID_STATUSES: VisitStatus[] = ["not_started", "clocked_in", "on_break", "finished"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!verifyAdminCookieValue(req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const status = String(body.status ?? "") as VisitStatus;
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
  }

  try {
    const result = await updateVisitStatus(params.id, status);
    const justFinished = result.record?.visitStatus === "finished" && (status === "finished" || result.autoFinished);
    if (result.record && justFinished) {
      // Best-effort "prompt the customer to pay" — the status page also
      // shows the Pay Now button regardless of whether this send succeeds.
      // Also fires when this call is the one that discovered a 12-hour
      // forced clock-out (result.autoFinished), not just an explicit
      // "Finished" click.
      await sendVisitFinishedEmail(result.record).catch(() => {});
    }
    return NextResponse.json({ ok: result.ok, record: result.record, error: result.error }, { status: result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't reach the booking database." }, { status: 503 });
  }
}
