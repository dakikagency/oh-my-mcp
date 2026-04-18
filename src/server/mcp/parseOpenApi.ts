/**
 * Parse + dereference an OpenAPI document from a string.
 *
 * We keep this Worker-friendly: dereferencing is done in-memory on the raw
 * JSON using a small, self-contained `$ref` resolver so we don't pull in
 * Node-only validators. Remote `$ref`s are fetched via `fetch()` which works
 * in both Node and workerd.
 *
 * This is intentionally lenient — we do not strictly validate the document.
 * Invalid or partial specs will still produce a best-effort tool list; the
 * caller can then surface validation messages in the UI.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { HTTPException } from "hono/http-exception";

/** Parses text (JSON or YAML) into a JSON object, then dereferences $refs. */
export async function parseOpenApi(text: string): Promise<unknown> {
  const parsed = tryParse(text);
  if (!parsed || typeof parsed !== "object") {
    throw new HTTPException(400, { message: "OpenAPI document is not a valid object." });
  }
  if (!(parsed as any).openapi && !(parsed as any).swagger) {
    throw new HTTPException(400, { message: "Missing `openapi` or `swagger` field." });
  }
  if ((parsed as any).swagger && !(parsed as any).openapi) {
    throw new HTTPException(400, {
      message:
        "Swagger 2.0 documents are not yet supported — please convert to OpenAPI 3.x first.",
    });
  }
  const deref = await dereference(parsed);
  return deref;
}

function tryParse(text: string): unknown {
  // JSON first (fast path).
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through to YAML */
    }
  }
  // Minimal YAML support: only what's necessary for common OpenAPI specs.
  // We avoid bundling a full YAML parser in the Worker. For JSON-only specs
  // this branch is never hit; for YAML, the user can paste JSON or the ingest
  // route can translate upstream. For now, reject gracefully.
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new HTTPException(400, {
      message:
        "Could not parse OpenAPI document. Please provide JSON (YAML support is coming soon).",
    });
  }
}

// ---- In-memory $ref dereferencer ----

async function dereference(root: unknown): Promise<unknown> {
  const rootObj = root as any;
  const seen = new WeakSet<object>();

  async function resolve(node: any): Promise<any> {
    if (node === null || typeof node !== "object") return node;
    if (seen.has(node)) return node;
    seen.add(node);

    if (typeof node.$ref === "string") {
      const resolved = await resolveRef(node.$ref, rootObj);
      // Merge sibling fields (allowed in OpenAPI 3.1) so that `description`
      // etc. still take effect.
      const { $ref: _ignored, ...siblings } = node;
      void _ignored;
      const merged = typeof resolved === "object" && resolved
        ? { ...(resolved as object), ...siblings }
        : resolved;
      return await resolve(merged);
    }

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) node[i] = await resolve(node[i]);
      return node;
    }

    for (const key of Object.keys(node)) {
      node[key] = await resolve(node[key]);
    }
    return node;
  }

  return await resolve(rootObj);
}

async function resolveRef(ref: string, root: any): Promise<unknown> {
  if (ref.startsWith("#/")) {
    return resolvePointer(root, ref.slice(2));
  }
  // External ref — fetch and resolve fragment.
  const [urlPart, fragment] = ref.split("#");
  const res = await fetch(urlPart);
  if (!res.ok) {
    throw new HTTPException(400, {
      message: `Could not fetch external $ref ${urlPart}: ${res.status}`,
    });
  }
  const external = await res.json();
  return fragment ? resolvePointer(external, fragment.replace(/^\//, "")) : external;
}

function resolvePointer(obj: any, pointer: string): unknown {
  if (!pointer) return obj;
  const parts = pointer.split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}
