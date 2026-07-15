import crypto from "crypto";

// Owner-side auth for the live-chat inbox. Deliberately separate from the
// customer session mechanism in session.ts: customers prove identity by a
// live Stripe check, but there's only one owner and no Stripe customer
// record for them, so this is a plain shared-secret password check that
// mints a signed cookie on success - same HMAC signing approach as
// session.ts (so it can't be forged without SESSION_SECRET), just a much
// simpler payload and a distinct cookie name so the two mechanisms can
// never be confused with each other.

const COOKIE_NAME = "isc_owner";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

export interface OwnerPayload {
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

export function createOwnerCookieValue(): string {
  const payload: OwnerPayload = { iat: Date.now() };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(data);
  return `${data}.${sig}`;
}

export function verifyOwnerCookieValue(value: string | undefined | null): OwnerPayload | null {
  if (!value) return null;
  const [data, sig] = value.split(".");
  if (!data || !sig) return null;

const expected = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

try {
  const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as OwnerPayload;
  if (Date.now() - payload.iat > MAX_AGE_SECONDS * 1000) return null;
  return payload;
} catch {
  return null;
}
}

// Constant-time-ish password check. When lengths differ we still run a
// timingSafeEqual of matching size before returning false, so a wrong
// password doesn't return measurably faster just for being the wrong
// length.
export function checkOwnerPassword(password: string): boolean {
  const expected = process.env.OWNER_DASHBOARD_PASSWORD;
  if (!expected) return false;

const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(Buffer.alloc(a.length), Buffer.alloc(a.length));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export const OWNER_COOKIE_NAME = COOKIE_NAME;
export const OWNER_MAX_AGE = MAX_AGE_SECONDS;
