import crypto from "crypto";
import { getRedis } from "./redis";

// Lets the owner recover admin access without having to go find and edit
// ADMIN_PASSWORD in Vercel's environment variable settings every time they
// forget it. ADMIN_PASSWORD remains the baseline password and always keeps
// working - "forgot password" instead lets the owner set an *override*
// password, scrypt-hashed and stored in the same shared Redis instance
// already used for bookings and the barcode database (see redis.ts). Once
// an override exists it takes priority over ADMIN_PASSWORD; nothing here
// ever touches the env var itself, so there's always a way back in even if
// Redis or this whole mechanism is unavailable.

const OVERRIDE_KEY = "admin:password_override"; // "salt:hash" hex, or absent
const RESET_TOKEN_PREFIX = "admin:reset_token:";
// Long enough to receive and click an email without rushing, short enough
// that a reset link found later in an old inbox can't still be used.
const RESET_TOKEN_TTL_SECONDS = 30 * 60;

function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
}

function timingSafeStringsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

async function getOverride(): Promise<string | null> {
  try {
    const redis = await getRedis();
    return await redis.get(OVERRIDE_KEY);
  } catch (e) {
    // A Redis hiccup shouldn't lock the owner out - just fall back to
    // treating no override as set, so ADMIN_PASSWORD alone still works.
    console.error("[adminAuth] Redis unavailable while checking password override", e);
    return null;
  }
}

// True once there's *some* way to log in - either the env var or a
// previously-set override. Used to give a precise "nothing is configured
// yet" message instead of a generic wrong-password error.
export async function hasAdminPasswordConfigured(): Promise<boolean> {
  if (process.env.ADMIN_PASSWORD) return true;
  return (await getOverride()) !== null;
}

export async function verifyAdminPassword(candidate: string): Promise<boolean> {
  const override = await getOverride();

  if (override) {
    const [salt, expectedHash] = override.split(":");
    if (!salt || !expectedHash) return false;
    const candidateHash = await hashPassword(candidate, salt);
    return timingSafeStringsEqual(candidateHash, expectedHash);
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeStringsEqual(candidate, expected);
}

export async function setAdminPasswordOverride(newPassword: string): Promise<void> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(newPassword, salt);
  const redis = await getRedis();
  await redis.set(OVERRIDE_KEY, `${salt}:${hash}`);
}

export async function createPasswordResetToken(): Promise<string> {
  const token = crypto.randomUUID();
  const redis = await getRedis();
  await redis.set(`${RESET_TOKEN_PREFIX}${token}`, "1", { EX: RESET_TOKEN_TTL_SECONDS });
  return token;
}

// Atomically single-use via GETDEL - a token can't be raced or replayed
// even if two requests come in for it at once.
export async function consumePasswordResetToken(token: string): Promise<boolean> {
  if (!token) return false;
  const redis = await getRedis();
  const value = await redis.getDel(`${RESET_TOKEN_PREFIX}${token}`);
  return value === "1";
}
