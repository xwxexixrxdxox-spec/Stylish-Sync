import { NextRequest, NextResponse } from "next/server";
import { appendMessage, getSession } from "@/lib/liveChat";
import { notifyDiscord } from "@/lib/discordNotify";
import { verifyOwnerCookieValue, OWNER_COOKIE_NAME } from "@/lib/ownerAuth";
import { isRateLimited } from "@/lib/rateLimit";

// A single send endpoint shared by both sides of the conversation. Which
// role a message is attributed to is never taken from the request body -
// that would let a customer simply claim role: "owner". Instead: a valid
// signed owner cookie means "owner," anything else means "customer,"
// gated only by knowing the (unguessable) session id - see the design
// note in start/route.ts.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`live-chat-send:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many messages. Slow down a bit." }, { status: 429 });
  }

const body = await req.json().catch(() => ({}));
  const sessionId: string | undefined = typeof body.sessionId === "string" ? body.sessionId : undefined;
  const text: string = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";

if (!sessionId || !text) {
  return NextResponse.json({ error: "sessionId and message are required." }, { status: 400 });
}

const existing = await getSession(sessionId);
  if (!existing) {
    return NextResponse.json({ error: "This chat session has ended or expired." }, { status: 404 });
  }

const ownerCookie = req.cookies.get(OWNER_COOKIE_NAME)?.value;
  const isOwner = !!verifyOwnerCookieValue(ownerCookie);

if (existing.status === "closed" && !isOwner) {
  return NextResponse.json({ error: "This chat session has been closed." }, { status: 409 });
}

const updated = await appendMessage(sessionId, { role: isOwner ? "owner" : "customer", text });
  if (!updated) {
    return NextResponse.json({ error: "This chat session has ended or expired." }, { status: 404 });
  }

if (!isOwner) {
  void notifyDiscord(
    `New live chat message${existing.email ? ` from ${existing.email}` : ""}:\n"${text}"`
    );
}

return NextResponse.json({ session: updated });
}
