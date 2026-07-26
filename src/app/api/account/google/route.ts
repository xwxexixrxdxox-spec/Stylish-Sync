import { NextRequest, NextResponse } from "next/server";
import { createOrGetGoogleAccount, toPublicAccount } from "@/lib/accounts";
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";
import { isRateLimited } from "@/lib/rateLimit";

// "Continue with Google" signup/login. The client obtains an access token
// client-side (googleSheets.ts's requestAccessToken, already scoped to
// include userinfo.email for the booking-match feature) and sends only the
// token here - never an email directly, since a client-supplied email
// can't be trusted. This route calls Google's own userinfo endpoint
// server-side to find out, authoritatively, which verified email the
// token actually belongs to, and only that server-verified email is ever
// used to create or look up an account.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`account-google:${ip}`, 10, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing Google token." }, { status: 400 });
  }

  let verifiedEmail: string | null = null;
  try {
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (userinfoRes.ok) {
      const info = await userinfoRes.json();
      if (info.email && (info.email_verified === true || info.email_verified === "true")) {
        verifiedEmail = info.email;
      }
    }
  } catch {
    // falls through to the error response below
  }

  if (!verifiedEmail) {
    return NextResponse.json(
      { ok: false, error: "Couldn't verify that Google account. Try again." },
      { status: 401 }
    );
  }

  const account = await createOrGetGoogleAccount(verifiedEmail);
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
