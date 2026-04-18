import { Hono } from "hono";
import type { Env } from "../context";
import { requireAuth } from "../guards";

export const meRouter = new Hono<Env>()
  .use("*", requireAuth)
  .get("/", async (c) => {
    const s = c.var.session!;
    return c.json({
      user: {
        id: s.user.id,
        name: s.user.name,
        email: s.user.email,
        image: s.user.image ?? null,
      },
      activeOrgId: c.var.orgId,
    });
  });

export type MeRouter = typeof meRouter;
