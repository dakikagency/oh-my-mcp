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
import { parse as parseYaml, parseAllDocuments } from "yaml";

import { convertSwagger2ToOpenApi3 } from "./convert-swagger2";

/** Parses text (JSON or YAML) into a JSON object, then dereferences $refs. */
export async function parseOpenApi(text: string): Promise<unknown> {
  let parsed = tryParse(text);
  if (!parsed || typeof parsed !== "object") {
    throw new HTTPException(400, { message: "OpenAPI document is not a valid object." });
  }
  if (!(parsed as any).openapi && !(parsed as any).swagger) {
    throw new HTTPException(400, { message: "Missing `openapi` or `swagger` field." });
  }
  // Normalize Swagger 2.0 into OpenAPI 3.0 so the tool compiler can stay
  // focused on a single spec shape.
  if ((parsed as any).swagger && !(parsed as any).openapi) {
    parsed = convertSwagger2ToOpenApi3(parsed);
  }
  const deref = await dereference(parsed);
  return deref;
}

function tryParse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new HTTPException(400, { message: "OpenAPI document is empty." });
  }
  // JSON first (fast path) when the text clearly looks like JSON.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through to YAML — some specs embed comments etc. */
    }
  }
  // YAML (a superset of JSON in practice for most specs).
  try {
    return parseYaml(trimmed, { prettyErrors: true });
  } catch (err) {
    // A common real-world case: the fetched text is a Markdown file with
    // Jekyll/Hugo-style `---` frontmatter, or a genuine multi-document YAML
    // file. Either way, `parse()` fails with "Source contains multiple
    // documents". Fall back to parsing all docs and picking the right one.
    if (err instanceof Error && /multiple documents/i.test(err.message)) {
      return pickOpenApiDocument(trimmed);
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new HTTPException(400, {
      message: `Could not parse OpenAPI document as JSON or YAML: ${detail}`,
    });
  }
}

/**
 * Given raw text that contains multiple YAML documents, decide which one
 * (if any) to treat as the OpenAPI spec.
 *
 * TODO(you): implement the selection strategy. See comment in PR/chat for
 * the three options (search / first-doc / reject). Return the chosen JS
 * object, or throw an `HTTPException(400, ...)` with a clear message when
 * none of the documents look like an OpenAPI spec.
 *
 * Hints:
 *   - `parseAllDocuments(text).map((d) => d.toJS())` gives you `unknown[]`.
 *   - An OpenAPI spec has either an `openapi` or a `swagger` string field
 *     at the top level (see the check on line 27).
 */
function pickOpenApiDocument(text: string): unknown {
  const docs = parseAllDocuments(text).map((d) => d.toJS());
  // TODO: replace this placeholder with your chosen strategy (5-10 lines).
  throw new HTTPException(400, {
    message: `Multiple YAML documents found (${docs.length}). Paste only the OpenAPI spec, or link directly to the raw file.`,
  });
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
