import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { Prisma } from "@prisma/client";

import type { Env } from "../context";
import { requireOrg } from "../guards";
import {
  createServerSchema,
  quickCreateServerSchema,
  updateServerSchema,
} from "@/lib/schemas";
import { compileOpenApiToTools } from "@/server/mcp/from-openapi";
import { parseOpenApi } from "@/server/mcp/parse-openapi";
import { sha256Hex } from "@/lib/crypto";
import { looksLikeUrl, randomSuffix, slugCandidates, slugify } from "@/lib/utils";

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

  /**
   * One-shot ingest + server creation. Accepts either a URL or a raw
   * OpenAPI document (JSON/YAML) in a single string field. Auto-derives
   * name, slug, and baseUrl from the spec; defaults visibility to PUBLIC
   * so the MCP endpoint works immediately without a bearer token.
   */
  .post("/quick-create", zValidator("json", quickCreateServerSchema), async (c) => {
    const { input } = c.req.valid("json");
    const orgId = c.var.orgId!;
    const userId = c.var.session!.user.id;

    const trimmed = input.trim();
    if (!trimmed) throw new HTTPException(400, { message: "Empty input." });

    // 1. Resolve input → raw OpenAPI text.
    let rawText: string;
    let sourceKind: "URL" | "PASTE" = "PASTE";
    let sourceUrl: string | null = null;
    let originFallback: string | null = null;

    if (looksLikeUrl(trimmed)) {
      sourceKind = "URL";
      sourceUrl = trimmed;
      try {
        originFallback = new URL(trimmed).origin;
      } catch {
        /* handled below */
      }
      const res = await fetch(trimmed, { redirect: "follow" });
      if (!res.ok) {
        throw new HTTPException(400, {
          message: `Failed to fetch OpenAPI from URL: ${res.status} ${res.statusText}`,
        });
      }
      rawText = await res.text();
    } else {
      rawText = trimmed;
    }

    // 2. Parse + compile.
    const doc = await parseOpenApi(rawText);
    const compiled = compileOpenApiToTools(doc);
    const normalized = JSON.stringify(doc);
    const hash = await sha256Hex(normalized);

    // 3. Persist the doc (or reuse the existing hash-matched row).
    const docRow = await upsertOpenApiDoc(c.var.db, {
      organizationId: orgId,
      title: compiled.info.title,
      version: compiled.info.version,
      source: sourceKind,
      sourceUrl,
      hash,
      rawJson: doc as Prisma.InputJsonValue,
    });

    // 4. Resolve a baseUrl. Prefer the compiled one; otherwise fall back
    // to the URL origin the user pasted (trailing slash stripped).
    const baseUrl = compiled.info.baseUrl ?? originFallback;
    if (!baseUrl) {
      throw new HTTPException(400, {
        message:
          "Could not determine a base URL — add a `servers[]` entry to your OpenAPI document.",
      });
    }

    // 5. Derive slug; retry with random suffix on collision. The slug is
    // globally unique (see schema), so same-title specs across different
    // orgs still need disambiguation.
    const baseSlug = ensureMinLength(slugify(compiled.info.title), "mcp");

    for (const slug of slugCandidates(baseSlug)) {
      try {
        const created = await c.var.db.mcpServer.create({
          data: {
            name: compiled.info.title,
            slug,
            description: null,
            baseUrl,
            visibility: "PUBLIC",
            organizationId: orgId,
            openApiDocId: docRow.id,
            createdById: userId,
            tools: {
              create: compiled.tools.map((t) => ({
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
          select: { id: true, slug: true, name: true },
        });
        return c.json({ server: created, toolCount: compiled.tools.length }, 201);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          // Slug collision — try the next candidate.
          continue;
        }
        throw err;
      }
    }
    throw new HTTPException(409, {
      message: "Could not reserve a unique slug. Please retry.",
    });
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

/**
 * Slug schema requires >=3 chars. If the derived slug is too short
 * (e.g. a 1-char API name), pad it with a random suffix rather than
 * rejecting the request.
 */
function ensureMinLength(s: string, fallbackPrefix: string): string {
  const clean = s || "";
  if (clean.length >= 3) return clean;
  return `${clean || fallbackPrefix}-${randomSuffix(6)}`;
}

async function upsertOpenApiDoc(
  db: import("@prisma/client").PrismaClient,
  data: {
    organizationId: string;
    title: string;
    version: string;
    source: "URL" | "PASTE";
    sourceUrl: string | null;
    hash: string;
    rawJson: Prisma.InputJsonValue;
  }
) {
  try {
    return await db.openApiDoc.create({ data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.openApiDoc.findUnique({
        where: {
          organizationId_hash: {
            organizationId: data.organizationId,
            hash: data.hash,
          },
        },
      });
      if (existing) return existing;
    }
    throw err;
  }
}
