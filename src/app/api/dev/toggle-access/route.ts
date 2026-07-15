import { NextRequest, NextResponse } from "next/server";
import { DEV_ACCESS_COOKIE_NAME } from "@/lib/session";
import { isTestToolsEnabled } from "@/lib/devMode";

// A tester-only shortcut to preview the paid experience without running a
// real Stripe transaction. This is intentionally NOT the same cookie or
// code path used for real customers (see /api/verify-session and
// /api/check-access) — it's a separate, clearly-labeled bypass so it can
// never be confused with — or accidentally weaken — real payment
// verification.
//
// Safety: this route works whenever NODE_ENV !== "production" (true
// automatically under `npm run dev`), OR when NEXT_PUBLIC_ENABLE_TEST_TOOLS
// is explicitly set to "true" (for testing a production-style local build).
// That flag defaults to unset, so a real deploy stays safe unless someone
// deliberately sets it there too — don't set it in your production
// environment variables.

function devModeGuard(): NextResponse | null {
  if (!isTestToolsEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const blocked = devModeGuard();
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const enable = Boolean(body.enable);

  const res = NextResponse.json({ ok: true, enabled: enable });
  if (enable) {
    res.cookies.set(DEV_ACCESS_COOKIE_NAME, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 1 day, so it doesn't linger indefinitely
    });
  } else {
    res.cookies.delete(DEV_ACCESS_COOKIE_NAME);
  }
  return res;
}
