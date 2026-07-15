import { NextRequest, NextResponse } from "next/server";
import { respond } from "@/lib/supportBot";
import { verifySessionCookieValue, SESSION_COOKIE_NAME, DEV_ACCESS_COOKIE_NAME } from "@/lib/session";
import { customerHasActiveSubscription } from "@/lib/stripeServer";
import { isTestToolsEnabled } from "@/lib/devMode";

// The support chat itself is stateless rule-based logic (see lib/supportBot),
// but this endpoint is still the gatekeeper: even if someone found the
// widget in the DOM, they can't get a reply out of it without a verified
// paying-customer cookie. This mirrors the "customer support is a paid
// feature only" requirement at the API layer, not just in the UI.
export async function POST(req: NextRequest) {
  const devBypass = isTestToolsEnabled() && req.cookies.get(DEV_ACCESS_COOKIE_NAME)?.value === "1";

  if (!devBypass) {
    const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionCookieValue(cookie);
    if (!session) {
      return NextResponse.json({ error: "Support chat requires an active subscription." }, { status: 403 });
    }

    try {
      const { active } = await customerHasActiveSubscription(session.customerId);
      if (!active) {
        return NextResponse.json({ error: "Your subscription isn't active." }, { status: 403 });
      }
    } catch (e) {
      return NextResponse.json({ error: "Couldn't verify your subscription right now." }, { status: 503 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const message: string = body.message ?? "";
  const topicId: string | undefined = body.topicId;

  const turn = respond(message, topicId);
  return NextResponse.json(turn);
}
