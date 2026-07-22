import { createHash } from "crypto";
import webpush, { PushSubscription } from "web-push";
import { getRedis } from "./redis";

// Server side of the opt-in reorder-reminder push notifications.
//
// Architecture constraint this whole file exists to work around: the app is
// local-first — inventory lives in the customer's browser, and the server
// normally holds no copy. But web push has to be SENT from a server, on a
// schedule, while the app is closed. So customers who opt in sync a small
// "digest" (just what a useful notification needs: low-stock items and
// high-usage items with their names/quantities/rates) to Redis whenever
// they use the app, and a daily Vercel cron (see api/notifications/cron)
// composes a per-customer, per-item message from that digest. The digest is
// as stale as the customer's last visit — which is exactly right for a
// "worth checking these items" reminder, and means notification content
// changes as their real-world usage changes rather than ever being a
// generic "check your stock" ping. If there's nothing worth saying (no low
// stock, no fast movers), nothing is sent at all.
//
// Redis key scheme (following booking.ts's documented-comment convention):
//   isc_push_vapid_v1                 -> {publicKey, privateKey} (created once)
//   isc_push_sub_v1:<sha256(endpoint)> -> PushRecord JSON

const VAPID_KEY = "isc_push_vapid_v1";
const SUB_PREFIX = "isc_push_sub_v1:";
// Resend no sooner than this after the previous send — a daily cron with a
// 20h floor tolerates the cron firing at slightly different times each day
// (Vercel only guarantees hour-ish precision) without ever double-sending.
const MIN_RESEND_MS = 20 * 60 * 60 * 1000;
// A digest older than this means the customer hasn't opened the app in two
// weeks — data that stale makes "3 packs left" claims unreliable, so pause
// reminders until they visit again (which refreshes the digest).
const MAX_DIGEST_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface PushLowItem {
  name: string;
  quantity: number;
  unit: string;
  reorderAt: number;
}

export interface PushUsageItem {
  name: string;
  quantity: number;
  unit: string;
  avgPerDay: number;
  daysLeft: number;
}

export interface PushDigest {
  lowStock: PushLowItem[];
  highUsage: PushUsageItem[];
  updatedAt: string;
}

export interface PushRecord {
  subscription: PushSubscription;
  digest: PushDigest | null;
  createdAt: string;
  lastSentAt: string | null;
}

export function subKeyForEndpoint(endpoint: string): string {
  return SUB_PREFIX + createHash("sha256").update(endpoint).digest("hex");
}

// Defensive parse-with-defaults, same rationale as booking.ts's
// parseBookingRecord: records written before a future schema change won't
// retroactively gain new fields, so every read backfills.
export function parsePushRecord(raw: string | null): PushRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PushRecord>;
    if (!parsed.subscription?.endpoint) return null;
    return {
      subscription: parsed.subscription as PushSubscription,
      digest: parsed.digest ?? null,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      lastSentAt: parsed.lastSentAt ?? null,
    };
  } catch {
    return null;
  }
}

// VAPID keys are generated once and persisted in Redis rather than living
// in env vars — no dashboard round-trip needed to provision them, and every
// serverless instance reads the same pair. SET NX guards the (unlikely)
// first-ever race between two instances both finding no key.
export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const redis = await getRedis();
  const existing = await redis.get(VAPID_KEY);
  if (existing) return JSON.parse(existing);
  const fresh = webpush.generateVAPIDKeys();
  const won = await redis.set(VAPID_KEY, JSON.stringify(fresh), { NX: true });
  if (won) return fresh;
  return JSON.parse((await redis.get(VAPID_KEY)) as string);
}

async function configuredWebpush() {
  const keys = await getVapidKeys();
  webpush.setVapidDetails("mailto:xwxexixrxdxox@gmail.com", keys.publicKey, keys.privateKey);
  return webpush;
}

// The user-facing requirement this encodes: never a generic "check your
// high usage items" message. Every notification names real items with
// their real numbers, computed from the customer's own recorded usage —
// and if there's genuinely nothing to say, we say nothing.
export function composeDigestMessage(digest: PushDigest): { title: string; body: string } | null {
  const low = digest.lowStock ?? [];
  const lowNames = new Set(low.map((it) => it.name));
  // "Fast mover worth checking": meaningful usage rate and projected to run
  // out within two weeks — but not already in the low-stock list, which
  // would double-report the same item.
  const fastMovers = (digest.highUsage ?? []).filter(
    (it) => it.avgPerDay > 0 && it.daysLeft <= 14 && !lowNames.has(it.name)
  );

  const lines: string[] = [];
  for (const it of low.slice(0, 3)) {
    lines.push(`${it.name}: ${it.quantity} ${it.unit} left (reorder at ${it.reorderAt})`);
  }
  if (low.length > 3) lines.push(`…and ${low.length - 3} more below reorder point`);
  for (const it of fastMovers.slice(0, 2)) {
    const days = Math.max(1, Math.round(it.daysLeft));
    lines.push(
      `${it.name} is moving fast — ${it.quantity} ${it.unit} left, ~${days} day${days === 1 ? "" : "s"} at ${it.avgPerDay.toFixed(1)}/day`
    );
  }

  if (lines.length === 0) return null;

  let title: string;
  if (low.length === 1) title = `${low[0].name} needs reordering`;
  else if (low.length > 1) title = `${low.length} items need reordering`;
  else if (fastMovers.length === 1) title = `${fastMovers[0].name} is running down fast`;
  else title = `${fastMovers.length} fast movers worth a reorder check`;

  return { title, body: lines.join("\n") };
}

export interface CronResult {
  checked: number;
  sent: number;
  skipped: number;
  deleted: number;
}

// Walks every stored subscription and sends whichever ones are due. Safe to
// invoke more than once (manually, or a retried cron): the lastSentAt floor
// makes extra invocations no-ops rather than duplicate notifications.
export async function sendDueDigests(): Promise<CronResult> {
  const redis = await getRedis();
  const push = await configuredWebpush();
  const result: CronResult = { checked: 0, sent: 0, skipped: 0, deleted: 0 };
  const now = Date.now();

  for await (const keys of redis.scanIterator({ MATCH: `${SUB_PREFIX}*`, COUNT: 100 })) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      result.checked += 1;
      const record = parsePushRecord(await redis.get(key));
      if (!record) {
        await redis.del(key);
        result.deleted += 1;
        continue;
      }
      const digest = record.digest;
      const digestFresh = digest && now - new Date(digest.updatedAt).getTime() < MAX_DIGEST_AGE_MS;
      const due = !record.lastSentAt || now - new Date(record.lastSentAt).getTime() > MIN_RESEND_MS;
      const message = digest && digestFresh ? composeDigestMessage(digest) : null;
      if (!due || !message) {
        result.skipped += 1;
        continue;
      }
      try {
        await push.sendNotification(
          record.subscription,
          JSON.stringify({ title: message.title, body: message.body, tag: "ws-reorder-digest", url: "/" })
        );
        record.lastSentAt = new Date().toISOString();
        await redis.set(key, JSON.stringify(record));
        result.sent += 1;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 404/410 mean the browser permanently revoked this subscription
        // (permission withdrawn, SW unregistered) — delete rather than
        // retrying it forever.
        if (statusCode === 404 || statusCode === 410) {
          await redis.del(key);
          result.deleted += 1;
        } else {
          result.skipped += 1;
        }
      }
    }
  }
  return result;
}
