import { NextResponse } from "next/server";
import { OWNER_COOKIE_NAME } from "@/lib/ownerAuth";

export async function POST() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(OWNER_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    return res;
}
