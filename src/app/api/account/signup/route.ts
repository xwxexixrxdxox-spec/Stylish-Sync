import { NextRequest, NextResponse } from "next/server";
import { createAccountWithPassword, toPublicAccount } from "@/lib/accounts";
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";
import { isRateLimited } from "@/lib/rateLimit";

// Email/password signup - a Google account is never required (see
// /api/account/google for the "Continue with Google" alternative, which
// also works as a signup). No Stripe/billing data is touched anywhere in
// this flow; this cookie only ever means "signed in," never "paid."
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`account-signup:${ip}`, 8, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");

  const result = await createAccountWithPassword(email, password);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }

  const res = NextResponse.json({ ok: true, account: toPublicAccount(result.account) });
  res.cookies.set(
    SESSION_COOKIE_NAME,
    createSessionCookieValue({ accountId: result.account.id, email: result.account.email, iat: Date.now() }),
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    }
  );
  return res;
}
