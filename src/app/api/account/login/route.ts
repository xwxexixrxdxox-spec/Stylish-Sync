import { NextRequest, NextResponse } from "next/server";
import { verifyAccountPassword, toPublicAccount } from "@/lib/accounts";
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";
import { isRateLimited } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`account-login:${ip}`, 8, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");

  const account = await verifyAccountPassword(email, password);
  if (!account) {
    return NextResponse.json({ ok: false, error: "Incorrect email or password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, account: toPublicAccount(account) });
  res.cookies.set(
    SESSION_COOKIE_NAME,
    createSessionCookieValue({ accountId: account.id, email: account.email, iat: Date.now() }),
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
