import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rateLimit";
import { consumePasswordResetToken, setAdminPasswordOverride } from "@/lib/adminAuth";

const MIN_PASSWORD_LEN = 8;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`admin-reset:${ip}`, 8, 15 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (newPassword.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { ok: false, error: `Password must be at least ${MIN_PASSWORD_LEN} characters.` },
      { status: 400 }
    );
  }

  try {
    // Consume the token first - a bad/expired/already-used token should
    // never reach setAdminPasswordOverride.
    const valid = await consumePasswordResetToken(token);
    if (!valid) {
      return NextResponse.json(
        { ok: false, error: "This reset link is invalid or has expired. Request a new one from the sign-in page." },
        { status: 400 }
      );
    }
    await setAdminPasswordOverride(newPassword);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Couldn't reach the reset system right now. Try again shortly." },
      { status: 503 }
    );
  }
}
