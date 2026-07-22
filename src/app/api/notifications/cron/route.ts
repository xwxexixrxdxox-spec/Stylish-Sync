import { NextResponse } from "next/server";
import { sendDueDigests } from "@/lib/pushServer";

// Fired daily by Vercel Cron (see vercel.json). Deliberately safe to hit at
// any time, by anyone: sendDueDigests only sends to subscriptions that are
// actually due (20h+ since last send) and that have something concrete to
// say, so an extra manual/malicious invocation is a no-op rather than a
// spam vector. That idempotency — not a secret header — is the security
// model, since this deployment manages env vars sparingly and a leaked
// "cron secret" would otherwise be the exact same situation.
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await sendDueDigests();
  return NextResponse.json(result);
}
