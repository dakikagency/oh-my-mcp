import type { PrismaClient } from "@prisma/client";
import type { Auth, AuthSession } from "./auth";

/**
 * Hono context variables attached by middleware in `hono.ts`.
 *
 * - `db` is a per-request Prisma client bound to the current Neon connection.
 * - `auth` is the better-auth instance sharing the same DB client.
 * - `session` is populated when a logged-in user is detected; otherwise null.
 * - `orgId` is the active organization id resolved from the session.
 */
export type Env = {
  Variables: {
    db: PrismaClient;
    auth: Auth;
    session: AuthSession | null;
    orgId: string | null;
  };
  Bindings: {
    DATABASE_URL?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    ENCRYPTION_KEY?: string;
    NEXT_PUBLIC_APP_URL?: string;
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
  };
};
