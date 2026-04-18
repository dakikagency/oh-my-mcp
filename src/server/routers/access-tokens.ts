import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import type { Env } from "../context";
import { requireOrg, loadServer } from "../guards";
import { createAccessTokenSchema } from "@/lib/schemas";
import { randomToken, sha256Hex, tokenPrefix } from "@/lib/crypto";

/**
 * Inbound tokens that MCP clients present to reach a private server.
 * The raw token is shown exactly once on creation; thereafter we only store
 * a SHA-256 hash.
 */
export const accessTokensRouter = new Hono<Env>()
  .use("*", requireOrg)

  .get("/", async (c) => {
    const serverId = c.req.param("serverId")!;
    const server = await loadServer(c, serverId);
    const tokens = await c.var.db.mcpAccessToken.findMany({
      where: { serverId: server.id },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return c.json({ tokens });
  })

  .post("/", zValidator("json", createAccessTokenSchema), async (c) => {
    const serverId = c.req.param("serverId")!;
    const server = await loadServer(c, serverId);
    const body = c.req.valid("json");
    const raw = randomToken("omm");
    const tokenHash = await sha256Hex(raw);
    const prefix = tokenPrefix(raw);
    const created = await c.var.db.mcpAccessToken.create({
      data: {
        serverId: server.id,
        name: body.name,
        tokenHash,
        prefix,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    // Only time the raw token is returned.
    return c.json({ token: created, raw }, 201);
  })

  .post("/:tokenId/revoke", async (c) => {
    const serverId = c.req.param("serverId")!;
    const tokenId = c.req.param("tokenId");
    await loadServer(c, serverId);
    await c.var.db.mcpAccessToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
    return c.json({ ok: true });
  });

export type AccessTokensRouter = typeof accessTokensRouter;
