import { NextRequest, NextResponse } from "next/server";
import { closeSession } from "@/lib/liveChat";
import { verifyOwnerCookieValue, OWNER_COOKIE_NAME } from "@/lib/ownerAuth";

// Marking a chat resolved is an owner-only action, so this requires the
// signed owner cookie rather than trusting sessionId alone.
export async function POST(req: NextRequest) {
  const ownerCookie = req.cookies.get(OWNER_COOKIE_NAME)?.value;
  if (!verifyOwnerCookieValue(ownerCookie)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

const body = await req.json().catch(() => ({}));
  const sessionId: string | undefined = typeof body.sessionId === "string" ? body.sessionId : undefined;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  }

const updated = await closeSession(sessionId);
  if (!updated) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

return NextResponse.json({ session: updated });
}
