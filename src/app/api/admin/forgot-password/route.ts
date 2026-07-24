import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rateLimit";
import { createPasswordResetToken } from "@/lib/adminAuth";
import { sendAdminPasswordResetEmail } from "@/lib/email";

// No email address is accepted in the request body - there's exactly one
// admin, so "who gets the reset link" is always OWNER_NOTIFY_EMAIL, never
// something a caller can point elsewhere.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // Stricter than a plain login attempt - this sends a real email and, once
  // clicked, can replace the working password, so it's worth throttling
  // harder than /api/admin/login.
  if (isRateLimited(`admin-forgot:${ip}`, 3, 15 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again later." }, { status: 429 });
  }

  if (!process.env.OWNER_NOTIFY_EMAIL) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No recovery email is set up yet. Add OWNER_NOTIFY_EMAIL in Vercel's environment variables, or change ADMIN_PASSWORD directly there instead.",
      },
      { status: 400 }
    );
  }

  try {
    const token = await createPasswordResetToken();
    const result = await sendAdminPasswordResetEmail(token);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "Couldn't send the reset email right now." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Couldn't reach the reset system right now. Try again shortly." },
      { status: 503 }
    );
  }
}
