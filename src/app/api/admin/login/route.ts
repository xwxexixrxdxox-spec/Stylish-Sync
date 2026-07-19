import { NextRequest, NextResponse } from "next/server";
import { createAdminCookieValue, ADMIN_SESSION_COOKIE_NAME, ADMIN_SESSION_MAX_AGE } from "@/lib/session";
import { isRateLimited } from "@/lib/rateLimit";

// Single shared password, checked against ADMIN_PASSWORD - this screen has
// exactly one legitimate user (the business owner), so a full account
// system would be overkill. Set ADMIN_PASSWORD directly in your hosting
// provider's environment variables (not committed anywhere) and keep it to
// yourself.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`admin-login:${ip}`, 8, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_PASSWORD isn't set on this deployment yet." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");

  if (password !== expected) {
    return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE_NAME, createAdminCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}
