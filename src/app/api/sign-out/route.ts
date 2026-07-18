import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

// Clears the signed session cookie set by /api/restore-access, so a
// customer can sign out of paid features on this device. This never
// touches their Stripe subscription — it only forgets this browser's
// "I already proved I'm subscriber X" cookie, so the Account tab falls
// back to the RestoreAccess / PricingTiers view until they sign back in
// with their email.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
