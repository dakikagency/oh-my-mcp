import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import { getDb } from "@/lib/db";
import { createAuth } from "./auth";
import type { Env } from "./context";

import { serversRouter } from "./routers/servers";
import { openApiRouter } from "./routers/openapi";
import { toolsRouter } from "./routers/tools";
import { apiKeysRouter } from "./routers/api-keys";
import { accessTokensRouter } from "./routers/access-tokens";
import { orgsRouter } from "./routers/orgs";
import { meRouter } from "./routers/me";

/**
 * Root Hono app. Routes are chained so that Hono's RPC client can derive
 * the full `AppType`. Per-request Prisma + better-auth instances are
 * attached in middleware.
 */
const base = new Hono<Env>()
  .basePath("/api")
  .use("*", logger())
  .use("*", async (c, next) => {
    const url = c.env.DATABASE_URL ?? process.env.DATABASE_URL;
    const db = getDb(url);
    const auth = createAuth(url);
    c.set("db", db);
    c.set("auth", auth);
    await next();
  })
  // better-auth handles /api/auth/* (sign-in, sign-up, oauth, org plugin).
  .on(["GET", "POST"], "/auth/*", (c) => c.var.auth.handler(c.req.raw))
  .use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/auth")) return next();
    const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
    c.set("session", session ?? null);
    c.set("orgId", session?.session?.activeOrganizationId ?? null);
    await next();
  })
  .get("/health", (c) => c.json({ ok: true }));

const app = base
  .route("/me", meRouter)
  .route("/orgs", orgsRouter)
  .route("/openapi", openApiRouter)
  .route("/servers", serversRouter)
  .route("/servers/:serverId/tools", toolsRouter)
  .route("/servers/:serverId/api-keys", apiKeysRouter)
  .route("/servers/:serverId/access-tokens", accessTokensRouter)
  .onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error("[hono] unhandled", err);
    return c.json(
      { error: "internal_error", message: (err as Error)?.message ?? "Unknown error" },
      500
    );
  })
  .notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

export { app };
export type AppType = typeof app;
