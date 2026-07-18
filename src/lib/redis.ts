import { createClient, RedisClientType } from "redis";

// Lazy singleton connection, backing the shared crowdsourced barcode
// database (see community-lookup/route.ts). Cached on globalThis so we
// only ever open one connection per serverless instance (and per Node
// process during `next dev`, where hot-reload would otherwise leak a new
// connection on every file save) - the same pattern commonly used for a
// Prisma client singleton, for the same reason.

declare global {
  // eslint-disable-next-line no-var
  var __iscRedisClient: RedisClientType | undefined;
  // eslint-disable-next-line no-var
  var __iscRedisConnectPromise: Promise<RedisClientType> | undefined;
}

function buildClient(): RedisClientType {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set. Add the Vercel Redis integration (or any redis:// connection string) to your environment variables before using the shared barcode lookup."
    );
  }
  const client = createClient({ url }) as RedisClientType;
  client.on("error", (err) => {
    // node-redis requires an 'error' listener or it crashes the process on
    // any connection hiccup; log and let callers see failures via their
    // own try/catch instead.
    console.error("[redis] client error", err);
  });
  return client;
}

export async function getRedis(): Promise<RedisClientType> {
  if (global.__iscRedisClient?.isOpen) {
    return global.__iscRedisClient;
  }
  if (!global.__iscRedisConnectPromise) {
    const client = global.__iscRedisClient ?? buildClient();
    global.__iscRedisClient = client;
    global.__iscRedisConnectPromise = client.connect().then(
      () => client,
      (err) => {
        // Let the next call retry instead of caching a rejected promise
        // forever.
        global.__iscRedisConnectPromise = undefined;
        throw err;
      }
    );
  }
  return global.__iscRedisConnectPromise;
}
