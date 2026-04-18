import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";

import type { Env } from "../context";
import { requireOrg, loadServer } from "../guards";
import { createApiKeySchema } from "@/lib/schemas";
import { encryptSecret } from "@/lib/crypto";

/**
 * Upstream credentials for the MCP executor — bearer tokens, header/query
 * API keys, or basic auth username:password pairs. `secret` is encrypted
 * with AES-GCM using `ENCRYPTION_KEY` before storage and never returned.
 */
export const apiKeysRouter = new Hono<Env>()
  .use("*", requireOrg)

  .get("/", async (c) => {
    const serverId = c.req.param("serverId")!;
    const server = await loadServer(c, serverId);
    const keys = await c.var.db.mcpApiKey.findMany({
      where: { serverId: server.id },
      select: {
        id: true,
        name: true,
        type: true,
        paramName: true,
        schemeKey: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return c.json({ keys });
  })

  .post("/", zValidator("json", createApiKeySchema), async (c) => {
    const serverId = c.req.param("serverId")!;
    const server = await loadServer(c, serverId);
    const body = c.req.valid("json");
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new HTTPException(500, {
        message: "ENCRYPTION_KEY is not configured on this deployment.",
      });
    }
    const cipher = await encryptSecret(body.secret, key);
    const created = await c.var.db.mcpApiKey.create({
      data: {
        serverId: server.id,
        name: body.name,
        type: body.type,
        paramName: body.paramName ?? null,
        schemeKey: body.schemeKey ?? null,
        secretCipher: cipher,
      },
      select: {
        id: true,
        name: true,
        type: true,
        paramName: true,
        schemeKey: true,
        createdAt: true,
      },
    });
    return c.json({ key: created }, 201);
  })

  .delete("/:keyId", async (c) => {
    const serverId = c.req.param("serverId")!;
    const keyId = c.req.param("keyId");
    await loadServer(c, serverId);
    // Compound predicate prevents cross-tenant deletion when a key ID
    // from another server/org is known.
    const { count } = await c.var.db.mcpApiKey.deleteMany({
      where: { id: keyId, serverId },
    });
    if (count === 0) throw new HTTPException(404, { message: "Key not found." });
    return c.json({ ok: true });
  });

export type ApiKeysRouter = typeof apiKeysRouter;
