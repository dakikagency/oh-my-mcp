import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { Prisma } from "@prisma/client";

import type { Env } from "../context";
import { requireOrg } from "../guards";
import { createServerSchema, updateServerSchema } from "@/lib/schemas";
import { compileOpenApiToTools } from "@/server/mcp/from-openapi";

export const serversRouter = new Hono<Env>()
  .use("*", requireOrg)

  .get("/", async (c) => {
    const orgId = c.var.orgId!;
    const servers = await c.var.db.mcpServer.findMany({
      where: { organizationId: orgId },
      include: {
        _count: { select: { tools: true } },
        openApiDoc: { select: { title: true, version: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return c.json({ servers });
  })

  .post("/", zValidator("json", createServerSchema), async (c) => {
    const body = c.req.valid("json");
    const orgId = c.var.orgId!;
    const userId = c.var.session!.user.id;

    // Load the source doc so we know the upstream baseUrl fallback.
    const doc = await c.var.db.openApiDoc.findFirst({
      where: { id: body.openApiDocId, organizationId: orgId },
    });
    if (!doc) throw new HTTPException(404, { message: "OpenAPI document not found." });

    const { tools, info } = compileOpenApiToTools(doc.rawJson as unknown);
    const baseUrl = body.baseUrl ?? info.baseUrl ?? null;
    if (!baseUrl) {
      throw new HTTPException(400, {
        message:
          "No base URL supplied and none inferable from the OpenAPI servers[] array.",
      });
    }

    try {
      const created = await c.var.db.mcpServer.create({
        data: {
          name: body.name,
          slug: body.slug,
          description: body.description ?? null,
          baseUrl,
          visibility: body.visibility,
          organizationId: orgId,
          openApiDocId: doc.id,
          createdById: userId,
          tools: {
            create: tools.map((t) => ({
              name: t.name,
              operationId: t.operationId ?? null,
              method: t.method,
              path: t.path,
              summary: t.summary ?? null,
              description: t.description ?? null,
              inputSchema: t.inputSchema as unknown as Prisma.InputJsonValue,
              outputSchema: (t.outputSchema ?? null) as Prisma.InputJsonValue,
              wire: t.wire as unknown as Prisma.InputJsonValue,
              securityKeys: t.securityKeys,
              enabled: true,
            })),
          },
        },
        include: { _count: { select: { tools: true } } },
      });
      return c.json({ server: created }, 201);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new HTTPException(409, { message: "Slug already taken." });
      }
      throw err;
    }
  })

  .get("/:serverId", async (c) => {
    const serverId = c.req.param("serverId");
    const orgId = c.var.orgId!;
    const server = await c.var.db.mcpServer.findFirst({
      where: { id: serverId, organizationId: orgId },
      include: {
        openApiDoc: { select: { id: true, title: true, version: true } },
        _count: { select: { tools: true, apiKeys: true, accessTokens: true } },
      },
    });
    if (!server) throw new HTTPException(404, { message: "Server not found." });
    return c.json({ server });
  })

  .patch("/:serverId", zValidator("json", updateServerSchema), async (c) => {
    const serverId = c.req.param("serverId");
    const orgId = c.var.orgId!;
    const body = c.req.valid("json");
    try {
      const updated = await c.var.db.mcpServer.update({
        where: { id: serverId, organizationId: orgId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.slug !== undefined ? { slug: body.slug } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl ?? undefined } : {}),
          ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
          ...(body.config !== undefined
            ? { config: body.config as Prisma.InputJsonValue }
            : {}),
        },
      });
      return c.json({ server: updated });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002")
          throw new HTTPException(409, { message: "Slug already taken." });
        if (err.code === "P2025")
          throw new HTTPException(404, { message: "Server not found." });
      }
      throw err;
    }
  })

  .delete("/:serverId", async (c) => {
    const serverId = c.req.param("serverId");
    const orgId = c.var.orgId!;
    await c.var.db.mcpServer.delete({ where: { id: serverId, organizationId: orgId } });
    return c.json({ ok: true });
  });

export type ServersRouter = typeof serversRouter;
