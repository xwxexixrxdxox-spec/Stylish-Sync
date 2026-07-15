import { NextRequest, NextResponse } from "next/server";
import {
checkOwnerPassword,
createOwnerCookieValue,
OWNER_COOKIE_NAME,
OWNER_MAX_AGE,
} from "@/lib/ownerAuth";
import { isRateLimited } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
const ip = req.headers.get("x-forwarded-for") ?? "unknown";
if (isRateLimited(`owner-login:${ip}`, 10, 60_000)) {
return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
}

const body = await req.json().catch(() => ({}));
const password: string = typeof body.password === "string" ? body.password : "";

if (!checkOwnerPassword(password)) {
return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
}

const res = NextResponse.json({ ok: true });
res.cookies.set(OWNER_COOKIE_NAME, createOwnerCookieValue(), {
httpOnly: true,
secure: true,
sameSite: "lax",
maxAge: OWNER_MAX_AGE,
path: "/",
});
return res;
}
