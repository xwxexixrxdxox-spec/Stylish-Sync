import { NextRequest, NextResponse } from "next/server";
import { listActiveSessions } from "@/lib/liveChat";
import { verifyOwnerCookieValue, OWNER_COOKIE_NAME } from "@/lib/ownerAuth";

// The owner inbox list - everything currently open, newest activity
// first. Requires the signed owner cookie (see /api/owner/login); this is
// the one live-chat endpoint that exposes every customer's info at once,
// so it gets real auth rather than the capability-token trust the
// per-session endpoints use.
export async function GET(req: NextRequest) {
  const ownerCookie = req.cookies.get(OWNER_COOKIE_NAME)?.value;
  if (!verifyOwnerCookieValue(ownerCookie)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

const sessions = await listActiveSessions();
  return NextResponse.json({ sessions });
}
