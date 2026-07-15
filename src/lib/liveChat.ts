import crypto from "crypto";
import { getRedis } from "./redis";

// Redis-backed live chat sessions. Deliberately simple: one JSON blob per
// session (id, participants, transcript), plus a Set of the ids that are
// still "open" so the owner inbox can list what needs attention without
// scanning every key. Sessions carry a TTL so an abandoned chat doesn't
// live forever on the free 30MB Redis plan - activity (a new message)
// refreshes it.

const SESSION_PREFIX = "livechat:session:";
const ACTIVE_SET_KEY = "livechat:active";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 3; // 3 days of inactivity
const CLOSED_TTL_SECONDS = 60 * 60; // keep a closed transcript around briefly

export type ChatRole = "customer" | "owner" | "system";

export interface ChatMessage {
role: ChatRole;
text: string;
at: string; // ISO timestamp
}

export interface ChatSession {
id: string;
customerId: string;
email: string | null;
status: "open" | "closed";
createdAt: string;
updatedAt: string;
messages: ChatMessage[];
}

function key(id: string): string {
return `${SESSION_PREFIX}${id}`;
}

export async function createSession(input: {
customerId: string;
email: string | null;
initialMessage?: string;
}): Promise<ChatSession> {
const redis = await getRedis();
const id = crypto.randomUUID();
const now = new Date().toISOString();
const session: ChatSession = {
id,
customerId: input.customerId,
email: input.email,
status: "open",
createdAt: now,
updatedAt: now,
messages: input.initialMessage
? [{ role: "customer", text: input.initialMessage, at: now }]
: [],
};
await redis.set(key(id), JSON.stringify(session), { EX: SESSION_TTL_SECONDS });
await redis.sAdd(ACTIVE_SET_KEY, id);
return session;
}

export async function getSession(id: string): Promise<ChatSession | null> {
const redis = await getRedis();
const raw = await redis.get(key(id));
if (!raw) return null;
try {
return JSON.parse(raw) as ChatSession;
} catch {
return null;
}
}

export async function appendMessage(
id: string,
message: { role: ChatRole; text: string }
): Promise<ChatSession | null> {
const redis = await getRedis();
const session = await getSession(id);
if (!session) return null;

const now = new Date().toISOString();
session.messages.push({ ...message, at: now });
session.updatedAt = now;

const ttl = session.status === "open" ? SESSION_TTL_SECONDS : CLOSED_TTL_SECONDS;
await redis.set(key(id), JSON.stringify(session), { EX: ttl });
if (session.status === "open") {
await redis.sAdd(ACTIVE_SET_KEY, id);
}
return session;
}

export async function closeSession(id: string): Promise<ChatSession | null> {
const redis = await getRedis();
const session = await getSession(id);
if (!session) return null;

session.status = "closed";
session.updatedAt = new Date().toISOString();
await redis.set(key(id), JSON.stringify(session), { EX: CLOSED_TTL_SECONDS });
await redis.sRem(ACTIVE_SET_KEY, id);
return session;
}

export async function listActiveSessions(): Promise<ChatSession[]> {
const redis = await getRedis();
const ids = await redis.sMembers(ACTIVE_SET_KEY);
if (ids.length === 0) return [];

const raws = await Promise.all(ids.map((id) => redis.get(key(id))));
const sessions: ChatSession[] = [];
const staleIds: string[] = [];

raws.forEach((raw, i) => {
if (!raw) {
staleIds.push(ids[i]);
return;
}
try {
const parsed = JSON.parse(raw) as ChatSession;
if (parsed.status === "open") {
sessions.push(parsed);
} else {
staleIds.push(ids[i]);
}
} catch {
staleIds.push(ids[i]);
}
});

// A key can expire (TTL) without ever being explicitly closed - sweep
// those out of the active set so the owner inbox doesn't accumulate
// ghost entries over time.
if (staleIds.length > 0) {
await redis.sRem(ACTIVE_SET_KEY, staleIds);
}

return sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
