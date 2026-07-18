import { NextRequest, NextResponse } from "next/server";
import { respond, getGreeting, HistoryTurn } from "@/lib/juesika";
import { isRateLimited } from "@/lib/rateLimit";

// Juesika (AI support chat) is free for everyone - no sign-in or
// subscription required. There's no live human chat team anymore; the
// only paid offering left is the one-time in-store install service (see
// stripeTiers.ts), which isn't gated through this endpoint at all.
//
// Since this is reachable by anyone, including signed-out visitors,
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
