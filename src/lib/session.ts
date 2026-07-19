import crypto from "crypto";

// Server-only helpers for a signed, tamper-proof "I am Stripe customer X"
// cookie. This is what makes the unlock mechanism safe: the cookie's
// payload can be read by anyone, but it can only be *created* by someone
// holding SESSION_SECRET (this server), because forging a valid signature
// without the secret is computationally infeasible. The client can never
// manufacture a valid cookie on its own, which is what satisfies "the
// customer should not be able to confirm their own payment."

const COOKIE_NAME = "isc_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days; access is re-verified
// live against Stripe on every check, so this is just how long we keep
// *asking* Stripe on behalf of this browser, not a trust window by itself.

export interface SessionPayload {
  customerId: string;
  email: string | null;
  iat: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Generate one with `openssl rand -hex 32` and add it to your environment variables before deploying."
    );
  }
  return secret;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createSessionCookieValue(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(data);
  return `${data}.${sig}`;
}

export function verifySessionCookieValue(value: string | undefined | null): SessionPayload | null {
  if (!value) return null;
  const [data, sig] = value.split(".");
  if (!data || !sig) return null;
  const expected = sign(data);
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;

// A deliberately separate cookie name from SESSION_COOKIE_NAME above, used
// only by the dev-only "preview paid access" toggle (see
// /api/dev/toggle-access). Keeping it distinct means the real,
// Stripe-verified session mechanism is never touched by the bypass.
export const DEV_ACCESS_COOKIE_NAME = "isc_dev_bypass";

// Admin session for the /admin visit-availability screen. Same
// sign-with-a-server-secret pattern as the customer session above (so a
// visitor can't forge one), reusing SESSION_SECRET rather than adding yet
// another required env var — this cookie just carries a boolean, not
// customer data, so there's no reason to isolate the secret further.
export const ADMIN_SESSION_COOKIE_NAME = "isc_admin_session";
const ADMIN_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days

export function createAdminCookieValue(): string {
  const data = Buffer.from(JSON.stringify({ admin: true, iat: Date.now() })).toString("base64url");
  const sig = sign(data);
  return `${data}.${sig}`;
}

export function verifyAdminCookieValue(value: string | undefined | null): boolean {
  if (!value) return false;
  const [data, sig] = value.split(".");
  if (!data || !sig) return false;
  const expected = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    return payload?.admin === true;
  } catch {
    return false;
  }
}

export const ADMIN_SESSION_MAX_AGE = ADMIN_MAX_AGE_SECONDS;
