import { NextRequest, NextResponse } from "next/server";
import { respond, getGreeting, HistoryTurn } from "@/lib/juesika";
import { isRateLimited } from "@/lib/rateLimit";

// Juesika (AI support chat) is free for everyone now - no sign-in or
// subscription required. Only escalating to a real live human agent (see
// /api/live-chat/start) stays Pro-only; that route independently
// re-checks Stripe, so the paywall is still enforced there even though
// this endpoint no longer checks it.
//
// Since this is now reachable by anyone, including signed-out visitors,
// it's rate-limited by IP - the old "you already proved you're a paying
// customer" gate used to double as abuse protection for the (paid,
// per-token) AI backend, so this replaces that job now that the gate's
// gone.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`support-chat:${ip}`, 20, 60_000)) {
    return NextResponse.json(
      { error: "You're sending messages a little fast - try again in a moment." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const message: string = body.message ?? "";
  const topicId: string | undefined = body.topicId;
  const history: HistoryTurn[] = Array.isArray(body.history) ? body.history : [];

  if (!message.trim() && !topicId) {
    return NextResponse.json(getGreeting());
  }

  const turn = await respond(message, topicId, history);
  return NextResponse.json(turn);
}
