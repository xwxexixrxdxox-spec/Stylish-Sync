import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieValue, SESSION_COOKIE_NAME, DEV_ACCESS_COOKIE_NAME } from "@/lib/session";
import { customerHasActiveSubscription } from "@/lib/stripeServer";
import { AccessCheckResponse } from "@/lib/types";
import { isTestToolsEnabled } from "@/lib/devMode";

// Called on every app load to decide whether to show the Support tab.
// Deliberately re-checks Stripe live rather than trusting a cached flag,
// so access disappears automatically on cancellation/non-renewal without
// needing a webhook-fed database.
export async function GET(req: NextRequest): Promise<NextResponse<AccessCheckResponse>> {
  // Tester-only shortcut: if the dev bypass is toggled on (see
  // /api/dev/toggle-access), skip Stripe entirely and report "paid."
  // That route — and therefore this cookie — can only ever be set when
  // isTestToolsEnabled() is true, so this branch is inert in any real
  // deployment even though the check lives here in the main code path.
  if (isTestToolsEnabled() && req.cookies.get(DEV_ACCESS_COOKIE_NAME)?.value === "1") {
    return NextResponse.json({
      access: true,
      plan: "Dev Test Mode (not a real subscription)",
      currentPeriodEnd: null,
    });
  }

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionCookieValue(cookie);

  if (!session) {
    return NextResponse.json({ access: false, reason: "no-session" });
  }

  try {
    const { active, planNickname, currentPeriodEnd } = await customerHasActiveSubscription(session.customerId);
    return NextResponse.json({
      access: active,
      plan: planNickname,
      currentPeriodEnd,
      reason: active ? undefined : "no-active-subscription",
    });
  } catch (e) {
    return NextResponse.json({ access: false, reason: "stripe-error" });
  }
}
