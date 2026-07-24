import { NextRequest, NextResponse } from "next/server";
import { createAdminCookieValue, ADMIN_SESSION_COOKIE_NAME, ADMIN_SESSION_MAX_AGE } from "@/lib/session";
import { isRateLimited } from "@/lib/rateLimit";
import { hasAdminPasswordConfigured, verifyAdminPassword } from "@/lib/adminAuth";

// Single shared password - this screen has exactly one legitimate user
// (the business owner), so a full account system would be overkill. The
// baseline password is ADMIN_PASSWORD, set directly in your hosting
// provider's environment variables (not committed anywhere); the owner can
// also set a Redis-backed override via the "Forgot password?" flow on the
// sign-in form without ever touching that env var - see adminAuth.ts.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`admin-login:${ip}`, 8, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");

  let valid: boolean;
  try {
    if (!(await hasAdminPasswordConfigured())) {
      return NextResponse.json(
        { ok: false, error: "ADMIN_PASSWORD isn't set on this deployment yet." },
        { status: 500 }
      );
    }
    valid = await verifyAdminPassword(password);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Couldn't verify your password right now. Try again shortly." },
      { status: 503 }
    );
  }

  if (!valid) {
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
