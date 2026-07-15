import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/liveChat";

// Polling trusts the session id itself as a capability token - anyone who
// has it can read that one conversation, but the id is an unguessable
// UUID that's only ever handed to the customer who started the session
// (via /api/live-chat/start) and shown to the owner in the password-gated
// inbox. This keeps polling cheap: no Stripe re-check on every request.
// Used by both the customer widget and the owner inbox to read the same
// transcript.
export async function GET(req: NextRequest) {
const sessionId = req.nextUrl.searchParams.get("sessionId");
if (!sessionId) {
return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
}

const session = await getSession(sessionId);
if (!session) {
return NextResponse.json({ error: "This chat session has ended or expired." }, { status: 404 });
}

return NextResponse.json({ session });
}
