import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { Prisma } from "@prisma/client";

import type { Env } from "../context";
import { requireOrg } from "../guards";
import { ingestFromUrlSchema, ingestFromTextSchema } from "@/lib/schemas";
import { sha256Hex } from "@/lib/crypto";
import { parseOpenApi } from "@/server/mcp/parseOpenApi";
import { compileOpenApiToTools } from "@/server/mcp/fromOpenAPI";

/**
 * OpenAPI ingest endpoints. Accepts a URL, a pasted document (JSON or YAML),
 * or a multipart file upload. Parses, validates, and persists the dereferenced
 * document. Returns a summary (tool count, title, version) plus the generated
 * `OpenApiDoc` id which is passed to `POST /servers` to materialize a server.
 */
export const openApiRouter = new Hono<Env>()
  .use("*", requireOrg)

  .get("/", async (c) => {
    const docs = await c.var.db.openApiDoc.findMany({
      where: { organizationId: c.var.orgId! },
      select: {
        id: true,
        title: true,
        version: true,
        source: true,
        sourceUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return c.json({ docs });
  })

  .post("/from-url", zValidator("json", ingestFromUrlSchema), async (c) => {
    const { url } = c.req.valid("json");
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      throw new HTTPException(400, {
        message: `Failed to fetch OpenAPI from URL: ${res.status} ${res.statusText}`,
      });
    }
    const text = await res.text();
    const doc = await parseOpenApi(text);
    return await persist(c, doc, { source: "URL", sourceUrl: url });
  })

  .post("/from-text", zValidator("json", ingestFromTextSchema), async (c) => {
    const body = c.req.valid("json");
    const doc = await parseOpenApi(body.content);
    return await persist(c, doc, { source: body.source, sourceUrl: null });
  })

  .post("/from-file", async (c) => {
    const form = await c.req.parseBody({ all: false });
    const file = form["file"];
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "Expected a file upload under `file`." });
    }
    const text = await file.text();
    const doc = await parseOpenApi(text);
    return await persist(c, doc, { source: "UPLOAD", sourceUrl: null });
  })

  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const doc = await c.var.db.openApiDoc.findFirst({
      where: { id, organizationId: c.var.orgId! },
    });
    if (!doc) throw new HTTPException(404, { message: "Not found." });
    const preview = compileOpenApiToTools(doc.rawJson as unknown);
    return c.json({
      id: doc.id,
      title: doc.title,
      version: doc.version,
      source: doc.source,
      sourceUrl: doc.sourceUrl,
      toolCount: preview.tools.length,
      baseUrl: preview.info.baseUrl,
    });
  });

async function persist(
  c: Context<Env>,
  doc: unknown,
  meta: { source: "UPLOAD" | "URL" | "PASTE"; sourceUrl: string | null }
) {
  const normalized = JSON.stringify(doc);
  const hash = await sha256Hex(normalized);
  const compiled = compileOpenApiToTools(doc);
  const orgId = c.var.orgId!;

  try {
    const created = await c.var.db.openApiDoc.create({
      data: {
        organizationId: orgId,
        title: compiled.info.title,
        version: compiled.info.version,
        source: meta.source,
        sourceUrl: meta.sourceUrl,
        hash,
        rawJson: doc as Prisma.InputJsonValue,
      },
    });
    return c.json(
      {
        doc: {
          id: created.id,
          title: created.title,
          version: created.version,
          toolCount: compiled.tools.length,
          baseUrl: compiled.info.baseUrl,
        },
      },
      201
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await c.var.db.openApiDoc.findUnique({
        where: { organizationId_hash: { organizationId: orgId, hash } },
      });
      if (existing) {
        return c.json({
          doc: {
            id: existing.id,
            title: existing.title,
            version: existing.version,
            toolCount: compiled.tools.length,
            baseUrl: compiled.info.baseUrl,
          },
          deduped: true,
        });
      }
    }
    throw err;
  }
}

export type OpenApiRouter = typeof openApiRouter;
