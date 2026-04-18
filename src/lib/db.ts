import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * Prisma client factory.
 *
 * On Cloudflare Workers we MUST create a fresh client per request because
 * connections from `@neondatabase/serverless` cannot be shared across
 * invocations. In Node.js (local `next dev`) we keep a singleton keyed on the
 * connection string to survive HMR without exhausting the pool.
 */

declare global {
  // eslint-disable-next-line no-var
  var __prisma_cache__: Map<string, PrismaClient> | undefined;
}

function createClient(connectionString: string): PrismaClient {
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

function isNodeLongLived(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions?.node === "string" &&
    process.env.NEXT_RUNTIME !== "edge" &&
    !(globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope
  );
}

/**
 * Returns a Prisma client bound to the given (or env-derived) connection
 * string. Safe to call inside request handlers — the Worker path always
 * creates a fresh client.
 */
export function getDb(connectionString?: string): PrismaClient {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — configure a Neon pooled connection string."
    );
  }

  if (isNodeLongLived() && process.env.NODE_ENV !== "production") {
    globalThis.__prisma_cache__ ??= new Map<string, PrismaClient>();
    const existing = globalThis.__prisma_cache__.get(url);
    if (existing) return existing;
    const client = createClient(url);
    globalThis.__prisma_cache__.set(url, client);
    return client;
  }

  return createClient(url);
}
