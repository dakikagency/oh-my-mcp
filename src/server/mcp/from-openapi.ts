/**
 * OpenAPI → MCP tool compiler.
 *
 * Supports OpenAPI 3.0 and 3.1 JSON documents. Responsibilities:
 * - Derives a `baseUrl` from `servers[0].url` if present.
 * - For every operation, creates a normalized tool descriptor with:
 *   - `name`: sanitized `operationId` or `METHOD_path` fallback.
 *   - `inputSchema`: a single JSON Schema merging path, query, header params
 *     and the JSON request body.
 *   - `outputSchema`: JSON Schema for the 2xx response body when present.
 *   - `securityKeys`: the names of security schemes the operation requires.
 *
 * This compiler does NOT dereference external `$ref`s — the caller is
 * expected to pass in a fully dereferenced document. See
 * `src/server/routers/openapi.ts` where that happens.
 *
 * All unknown extensions are ignored; the goal is a fast, pure-function
 * transformation that runs safely inside a Cloudflare Worker.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CompiledTool {
  name: string;
  operationId: string | null;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";
  path: string; // OpenAPI path template like /users/{id}
  summary: string | null;
  description: string | null;
  /** JSON Schema for tool inputs. */
  inputSchema: JsonSchema;
  outputSchema: JsonSchema | null;
  /** Names of referenced security schemes (maps to OpenAPI components.securitySchemes keys). */
  securityKeys: string[];
  /**
   * Instructions for mapping tool inputs to the outbound HTTP request.
   * Stored next to the schema so the executor doesn't need to re-parse
   * the OpenAPI doc at runtime.
   */
  wire: {
    path: Array<{ name: string }>;
    query: Array<{ name: string; style?: string; explode?: boolean }>;
    header: Array<{ name: string }>;
    body:
      | { kind: "json" }
      | { kind: "form"; contentType: "application/x-www-form-urlencoded" }
      | { kind: "none" };
  };
}

export interface CompiledInfo {
  title: string;
  version: string;
  baseUrl: string | null;
  securitySchemes: Record<string, any>;
}

export interface CompileResult {
  info: CompiledInfo;
  tools: CompiledTool[];
}

type JsonSchema = Record<string, any>;

const METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
] as const;

export function compileOpenApiToTools(doc: unknown): CompileResult {
  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid OpenAPI document: not an object.");
  }
  const d = doc as any;

  const info: CompiledInfo = {
    title: d.info?.title ?? "Untitled API",
    version: d.info?.version ?? "1.0.0",
    baseUrl: pickBaseUrl(d.servers),
    securitySchemes: d.components?.securitySchemes ?? {},
  };

  const tools: CompiledTool[] = [];
  const used = new Set<string>();

  const paths = (d.paths ?? {}) as Record<string, any>;
  for (const [rawPath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    const pathLevelParams = (pathItem as any).parameters ?? [];

    for (const method of METHODS) {
      const op = (pathItem as any)[method];
      if (!op || typeof op !== "object") continue;

      const merged = mergeParams(pathLevelParams, op.parameters ?? []);
      const name = uniqueName(
        sanitizeName(op.operationId ?? `${method}_${rawPath}`),
        used
      );
      used.add(name);

      const input = buildInputSchema(merged, op.requestBody);
      const output = buildOutputSchema(op.responses);

      const securityKeys = extractSecurityKeys(op.security ?? d.security ?? []);

      tools.push({
        name,
        operationId: op.operationId ?? null,
        method: method.toUpperCase() as CompiledTool["method"],
        path: rawPath,
        summary: op.summary ?? null,
        description: op.description ?? null,
        inputSchema: input.schema,
        outputSchema: output,
        securityKeys,
        wire: input.wire,
      });
    }
  }

  return { info, tools };
}

// ---- Internals ----

function pickBaseUrl(servers: any): string | null {
  if (!Array.isArray(servers) || servers.length === 0) return null;
  const raw = servers[0]?.url;
  if (typeof raw !== "string") return null;
  // Strip trailing slash; leave templated vars alone.
  return raw.replace(/\/$/, "");
}

function mergeParams(pathLevel: any[], opLevel: any[]): any[] {
  const byKey = new Map<string, any>();
  for (const p of pathLevel) byKey.set(`${p.in}:${p.name}`, p);
  for (const p of opLevel) byKey.set(`${p.in}:${p.name}`, p);
  return Array.from(byKey.values());
}

function sanitizeName(s: string): string {
  return s
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
    .toLowerCase();
}

function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function buildInputSchema(
  params: any[],
  requestBody: any
): { schema: JsonSchema; wire: CompiledTool["wire"] } {
  const props: Record<string, JsonSchema> = {};
  const required: string[] = [];
  const wire: CompiledTool["wire"] = {
    path: [],
    query: [],
    header: [],
    body: { kind: "none" },
  };

  for (const p of params) {
    if (!p || typeof p !== "object") continue;
    const schema: JsonSchema = { ...(p.schema ?? {}) };
    if (p.description && !schema.description) schema.description = p.description;
    if (p.example !== undefined && schema.examples === undefined) {
      schema.examples = [p.example];
    }
    switch (p.in) {
      case "path":
        wire.path.push({ name: p.name });
        props[p.name] = schema;
        required.push(p.name);
        break;
      case "query":
        wire.query.push({ name: p.name, style: p.style, explode: p.explode });
        props[p.name] = schema;
        if (p.required) required.push(p.name);
        break;
      case "header": {
        // Avoid colliding with transport auth; skip well-known ones.
        const reserved = new Set(["authorization", "cookie", "content-type"]);
        if (!reserved.has(String(p.name).toLowerCase())) {
          wire.header.push({ name: p.name });
          props[p.name] = schema;
          if (p.required) required.push(p.name);
        }
        break;
      }
      default:
        break;
    }
  }

  if (requestBody && typeof requestBody === "object") {
    const content = requestBody.content ?? {};
    const json = content["application/json"];
    const form = content["application/x-www-form-urlencoded"];
    if (json?.schema) {
      props.body = json.schema;
      if (requestBody.required) required.push("body");
      wire.body = { kind: "json" };
    } else if (form?.schema) {
      props.body = form.schema;
      if (requestBody.required) required.push("body");
      wire.body = {
        kind: "form",
        contentType: "application/x-www-form-urlencoded",
      };
    }
  }

  const schema: JsonSchema = {
    type: "object",
    properties: props,
    ...(required.length ? { required: Array.from(new Set(required)) } : {}),
    additionalProperties: false,
  };
  return { schema, wire };
}

function buildOutputSchema(responses: any): JsonSchema | null {
  if (!responses || typeof responses !== "object") return null;
  const keys = Object.keys(responses);
  const successKey =
    keys.find((k) => k.startsWith("2")) ?? (responses.default ? "default" : null);
  if (!successKey) return null;
  const resp = responses[successKey];
  const content = resp?.content ?? {};
  const json = content["application/json"];
  return (json?.schema as JsonSchema) ?? null;
}

function extractSecurityKeys(security: any[]): string[] {
  if (!Array.isArray(security)) return [];
  const keys = new Set<string>();
  for (const entry of security) {
    if (!entry || typeof entry !== "object") continue;
    for (const k of Object.keys(entry)) keys.add(k);
  }
  return Array.from(keys);
}
