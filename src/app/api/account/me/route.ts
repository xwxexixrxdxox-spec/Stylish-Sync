import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/session";
import { getAccountById, toPublicAccount } from "@/lib/accounts";

export async function GET(req: NextRequest) {
  const session = verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session?.accountId) {
    return NextResponse.json({ ok: false });
  }

  const account = await getAccountById(session.accountId);
  if (!account) {
    // The account was deleted (or Redis was reset) after this cookie was
    // issued - treat it the same as never having signed in, rather than
    // erroring.
    return NextResponse.json({ ok: false });
  }

  return NextResponse.json({ ok: true, account: toPublicAccount(account) });
}
