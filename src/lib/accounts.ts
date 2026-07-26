import crypto from "crypto";
import { getRedis } from "./redis";

// Customer account records - the Stripe-free replacement for the old
// subscription-linked session (see session.ts's header comment). An
// account here is just "an email + password (or a Google-verified email
// with no password)" - it carries no billing/entitlement meaning at all.
//
// Two Redis keys per account, the same "record + uniqueness index" shape
// booking.ts and adminAuth.ts already use elsewhere in this app:
//   account:<accountId>        -> JSON AccountRecord
//   account:email:<normalized> -> accountId (claimed with SET NX so two
//                                  concurrent signups for the same email
//                                  can't both "win")

export interface AccountRecord {
  id: string;
  email: string; // always the normalized (lowercased, trimmed) form
  passwordHash: string | null; // "salt:hash" hex, or null for a Google-only account
  googleLinked: boolean;
  createdAt: string;
}

export interface PublicAccount {
  id: string;
  email: string;
  googleLinked: boolean;
}

function accountKey(id: string): string {
  return `account:${id}`;
}

function emailIndexKey(email: string): string {
  return `account:email:${email}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Deliberately loose - this only guards against obvious junk ("a", "a b"),
// not full RFC 5322 validation. There's no verification email sent for a
// password signup here, so this is just a basic sanity check, not proof
// the address is real or reachable.
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

export function toPublicAccount(record: AccountRecord): PublicAccount {
  return { id: record.id, email: record.email, googleLinked: record.googleLinked };
}

export async function getAccountById(id: string): Promise<AccountRecord | null> {
  const redis = await getRedis();
  const raw = await redis.get(accountKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AccountRecord;
  } catch {
    return null;
  }
}

async function getAccountByEmail(email: string): Promise<AccountRecord | null> {
  const redis = await getRedis();
  const id = await redis.get(emailIndexKey(email));
  if (!id) return null;
  return getAccountById(id);
}

// Creates a brand-new password account. Fails with "exists" if the email is
// already claimed (by either a password or a Google-linked account) -
// there's exactly one account per email, regardless of how it was created.
export async function createAccountWithPassword(
  emailInput: string,
  password: string
): Promise<{ ok: true; account: AccountRecord } | { ok: false; error: string }> {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const redis = await getRedis();
  const id = crypto.randomUUID();
  const claimed = await redis.set(emailIndexKey(email), id, { NX: true });
  if (claimed !== "OK") {
    return { ok: false, error: "An account already exists for that email. Try logging in instead." };
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${await hashPassword(password, salt)}`;
  const record: AccountRecord = {
    id,
    email,
    passwordHash,
    googleLinked: false,
    createdAt: new Date().toISOString(),
  };
  await redis.set(accountKey(id), JSON.stringify(record));
  return { ok: true, account: record };
}

// Verifies email+password and returns the account on success, or null for
// either "no such email" or "wrong password" - deliberately the same
// generic failure either way, so a login attempt can't be used to probe
// which emails have an account. Still runs a dummy hash on the no-account
// path so it takes roughly the same time as a real check, rather than
// being a cheap early-out an attacker could distinguish by timing.
export async function verifyAccountPassword(emailInput: string, password: string): Promise<AccountRecord | null> {
  const email = normalizeEmail(emailInput);
  const record = await getAccountByEmail(email);
  if (!record || !record.passwordHash) {
    await hashPassword(password, "no-such-account-salt");
    return null;
  }
  const [salt, expectedHash] = record.passwordHash.split(":");
  if (!salt || !expectedHash) return null;
  const candidateHash = await hashPassword(password, salt);
  return timingSafeStringsEqual(candidateHash, expectedHash) ? record : null;
}

// "Continue with Google" - doubles as signup (first time this email is
// seen) and login (every time after), the same way most sites' "Continue
// with Google" button does. There's no password to check here; trust comes
// entirely from the caller having already verified the email against
// Google's own userinfo endpoint server-side (see /api/account/google) -
// this function does no verification of its own, so it must never be
// called with a client-supplied, unverified email.
export async function createOrGetGoogleAccount(emailInput: string): Promise<AccountRecord> {
  const email = normalizeEmail(emailInput);
  const redis = await getRedis();
  const existing = await getAccountByEmail(email);
  if (existing) {
    if (!existing.googleLinked) {
      const updated: AccountRecord = { ...existing, googleLinked: true };
      await redis.set(accountKey(existing.id), JSON.stringify(updated));
      return updated;
    }
    return existing;
  }

  const id = crypto.randomUUID();
  // Best-effort claim - if this exact email races with another signup
  // between the getAccountByEmail check above and here, whichever SET NX
  // loses just re-reads and returns the winner's record instead of
  // erroring, since "Continue with Google" is idempotent by design (unlike
  // password signup, there's no meaningful "already exists" error to show
  // for it).
  const claimed = await redis.set(emailIndexKey(email), id, { NX: true });
  if (claimed !== "OK") {
    const winner = await getAccountByEmail(email);
    if (winner) return winner;
  }
  const record: AccountRecord = {
    id,
    email,
    passwordHash: null,
    googleLinked: true,
    createdAt: new Date().toISOString(),
  };
  await redis.set(accountKey(id), JSON.stringify(record));
  return record;
}
