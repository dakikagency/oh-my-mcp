import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";

import type { Env } from "../context";
import { requireAuth } from "../guards";
import { createOrgSchema, inviteMemberSchema, setActiveOrgSchema } from "@/lib/schemas";

export const orgsRouter = new Hono<Env>()
  .use("*", requireAuth)

  .get("/", async (c) => {
    const userId = c.var.session!.user.id;
    const memberships = await c.var.db.member.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
    return c.json({
      organizations: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
      activeOrgId: c.var.orgId,
    });
  })

  .post("/", zValidator("json", createOrgSchema), async (c) => {
    const body = c.req.valid("json");
    try {
      const res = await c.var.auth.api.createOrganization({
        body: { name: body.name, slug: body.slug },
        headers: c.req.raw.headers,
      });
      if (!res) throw new HTTPException(400, { message: "Could not create organization." });
      return c.json({ organization: res }, 201);
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      // better-auth throws on slug collisions and similar; surface the
      // underlying message as a 409 so clients (sign-up retry loop, UI
      // toasts) can distinguish it from a true server error.
      const msg = err instanceof Error ? err.message : "Could not create organization.";
      throw new HTTPException(409, { message: msg });
    }
  })

  .post("/active", zValidator("json", setActiveOrgSchema), async (c) => {
    const { orgId } = c.req.valid("json");
    await c.var.auth.api.setActiveOrganization({
      body: { organizationId: orgId },
      headers: c.req.raw.headers,
    });
    return c.json({ ok: true, orgId });
  })

  .get("/:orgId/members", async (c) => {
    const orgId = c.req.param("orgId");
    const userId = c.var.session!.user.id;
    // Anyone signed in can hit this route; only return data if the caller
    // is a member of the target org. Without this guard, any user who
    // learns an org ID could enumerate member identities and emails.
    const membership = await c.var.db.member.findFirst({
      where: { organizationId: orgId, userId },
      select: { id: true },
    });
    if (!membership) throw new HTTPException(403, { message: "Forbidden." });
    const members = await c.var.db.member.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: "asc" },
    });
    return c.json({ members });
  })

  .post(
    "/:orgId/invitations",
    zValidator("json", inviteMemberSchema),
    async (c) => {
      const orgId = c.req.param("orgId");
      const body = c.req.valid("json");
      const inv = await c.var.auth.api.createInvitation({
        body: { email: body.email, role: body.role, organizationId: orgId },
        headers: c.req.raw.headers,
      });
      return c.json({ invitation: inv }, 201);
    }
  );

export type OrgsRouter = typeof orgsRouter;
