import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

import { getDb } from "@/lib/db";

/**
 * Builds a request-scoped better-auth instance. The Prisma adapter is bound
 * to the per-request Neon client so that each Worker invocation gets fresh
 * DB connections.
 */
export function createAuth(connectionString?: string) {
  const db = getDb(connectionString);

  const options = {
    database: prismaAdapter(db, { provider: "postgresql" }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
    },
    socialProviders: {
      ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: process.env.GITHUB_CLIENT_ID,
              clientSecret: process.env.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
    },
    plugins: [organization(), nextCookies()],
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Awaited<ReturnType<Auth["api"]["getSession"]>>;

let _auth: Auth | null = null;

function resolveAuth(): Auth {
  if (!_auth) _auth = createAuth();
  return _auth;
}

/**
 * Lazy-initialised singleton for Node.js (`next dev` and better-auth CLI).
 * Workers should prefer `createAuth(env.DATABASE_URL)` so that each
 * invocation uses its own DB connection.
 *
 * Access is proxied so the module can be imported at build time without
 * DATABASE_URL being set.
 */
export const auth = new Proxy({} as Auth, {
  get(_t, prop) {
    return Reflect.get(resolveAuth() as object, prop);
  },
  has(_t, prop) {
    return Reflect.has(resolveAuth() as object, prop);
  },
});
