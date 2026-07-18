import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieValue, SESSION_COOKIE_NAME, DEV_ACCESS_COOKIE_NAME } from "@/lib/session";
import { customerHasActiveSubscription } from "@/lib/stripeServer";
import { isTestToolsEnabled } from "@/lib/devMode";
import { createSession } from "@/lib/liveChat";
import { notifyDiscord } from "@/lib/discordNotify";
import { isLiveAgentAvailable, nextAvailableWindowLabel } from "@/lib/businessHours";
import { isRateLimited } from "@/lib/rateLimit";

// Starts a real live-chat session, gated the same way /api/support-chat is:
// a verified, Stripe-active paying customer only. This is deliberately the
// ONLY place in the live-chat flow that re-checks Stripe - every later
// poll/send call instead trusts the unguessable session id handed back
// here, the same way a short-lived capability token would work, which is
// what keeps polling cheap.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`live-chat-start:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again in a moment." }, { status: 429 });
  }

  const devBypass = isTestToolsEnabled() && req.cookies.get(DEV_ACCESS_COOKIE_NAME)?.value === "1";
  let customerId = "dev-preview";
  let email: string | null = null;

  if (!devBypass) {
    const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionCookieValue(cookie);
    if (!session) {
      return NextResponse.json(
        { error: "Live human support is a Pro feature — upgrade anytime to connect with a real person." },
        { status: 403 }
      );
    }

    try {
      const { active } = await customerHasActiveSubscription(session.customerId);
      if (!active) {
        return NextResponse.json(
          { error: "Live human support is a Pro feature — upgrade anytime to connect with a real person." },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json({ error: "Couldn't verify your subscription right now." }, { status: 503 });
    }

    customerId = session.customerId;
    email = session.email;
  }

  const body = await req.json().catch(() => ({}));
  const initialMessage: string | undefined =
    typeof body.message === "string" && body.message.trim() ? body.message.trim().slice(0, 2000) : undefined;

  let chatSession;
  try {
    chatSession = await createSession({ customerId, email, initialMessage });
  } catch (e) {
    console.error("[live-chat/start] failed", e);
    return NextResponse.json({ error: "Live chat isn't available right now." }, { status: 503 });
  }

  const available = isLiveAgentAvailable();
  void notifyDiscord(
    `New live chat request${email ? ` from ${email}` : ""} (${
      available ? "during business hours" : "after hours"
    }).\n${initialMessage ? `"${initialMessage}"` : "(no message yet)"}`
  );

  return NextResponse.json({
    sessionId: chatSession.id,
    available,
    availabilityLabel: available ? null : nextAvailableWindowLabel(),
  });
}
