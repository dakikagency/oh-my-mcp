/**
 * Swagger 2.0 → OpenAPI 3.0 in-place converter.
 *
 * The MCP tool compiler in `from-openapi.ts` only understands OpenAPI 3.x. To
 * keep that code simple, we normalize any incoming Swagger 2.0 document into a
 * minimal but correct 3.0 shape before dereferencing. This handles the parts
 * that matter for tool compilation:
 *
 * - `host` + `basePath` + `schemes` → `servers[]`
 * - `definitions` → `components.schemas`
 * - `securityDefinitions` → `components.securitySchemes` (with type remapping)
 * - `parameters` / `responses` (global) → `components.parameters` / `components.responses`
 * - Body & formData parameters → `requestBody` with the correct content type
 * - Non-body parameters: wrap `type`/`format`/`items`/`enum`/... into `schema`
 * - Response `schema` → `content[produces].schema`
 * - Rewrites `#/definitions/*`, `#/parameters/*`, `#/responses/*` refs
 *
 * It is intentionally lenient: unknown fields are passed through, and the goal
 * is a document the compiler can walk without crashing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnyRecord = Record<string, any>;

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
] as const;

/** Primitive JSON-Schema-compatible keys that may live at the parameter root in Swagger 2.0. */
const PRIMITIVE_SCHEMA_KEYS = [
  "type",
  "format",
  "items",
  "enum",
  "default",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "multipleOf",
] as const;

export function convertSwagger2ToOpenApi3(doc: unknown): AnyRecord {
  if (!doc || typeof doc !== "object") {
    throw new Error("Expected Swagger 2.0 document to be an object.");
  }
  const d = doc as AnyRecord;

  const out: AnyRecord = {
    openapi: "3.0.0",
    info: d.info ?? { title: "Untitled API", version: "1.0.0" },
  };

  const servers = buildServers(d.host, d.basePath, d.schemes);
  if (servers.length) out.servers = servers;

  if (Array.isArray(d.tags)) out.tags = d.tags;
  if (d.externalDocs) out.externalDocs = d.externalDocs;
  if (Array.isArray(d.security)) out.security = d.security;

  const components: AnyRecord = {};
  if (d.definitions && typeof d.definitions === "object") {
    components.schemas = d.definitions;
  }
  if (d.securityDefinitions && typeof d.securityDefinitions === "object") {
    components.securitySchemes = convertSecurityDefinitions(d.securityDefinitions);
  }
  if (d.parameters && typeof d.parameters === "object") {
    const converted: AnyRecord = {};
    for (const [name, p] of Object.entries(d.parameters)) {
      if (!p || typeof p !== "object") continue;
      // Component-level body params don't have a direct 3.x equivalent (they
      // become requestBody references); skip them rather than emit invalid 3.x.
      if ((p as AnyRecord).in === "body" || (p as AnyRecord).in === "formData") continue;
      converted[name] = convertParameter(p as AnyRecord);
    }
    if (Object.keys(converted).length) components.parameters = converted;
  }
  if (d.responses && typeof d.responses === "object") {
    const converted: AnyRecord = {};
    const produces = Array.isArray(d.produces) ? d.produces : [];
    for (const [name, r] of Object.entries(d.responses)) {
      if (!r || typeof r !== "object") continue;
      converted[name] = convertResponse(r as AnyRecord, produces);
    }
    if (Object.keys(converted).length) components.responses = converted;
  }
  if (Object.keys(components).length) out.components = components;

  if (d.paths && typeof d.paths === "object") {
    out.paths = convertPaths(
      d.paths as AnyRecord,
      Array.isArray(d.consumes) ? d.consumes : [],
      Array.isArray(d.produces) ? d.produces : []
    );
  }

  rewriteRefs(out);
  return out;
}

// ---- servers ----

function buildServers(host: unknown, basePath: unknown, schemes: unknown): AnyRecord[] {
  const h = typeof host === "string" ? host : "";
  const bp = typeof basePath === "string" ? basePath : "";
  if (!h && !bp) return [];
  const s = Array.isArray(schemes) && schemes.length > 0
    ? (schemes as string[]).filter((x) => typeof x === "string")
    : ["https"];
  const urls = s.map((scheme) => (h ? `${scheme}://${h}${bp}` : bp));
  return urls.map((url) => ({ url }));
}

// ---- security ----

function convertSecurityDefinitions(defs: AnyRecord): AnyRecord {
  const out: AnyRecord = {};
  for (const [name, raw] of Object.entries(defs)) {
    if (!raw || typeof raw !== "object") continue;
    const def = raw as AnyRecord;
    switch (def.type) {
      case "basic":
        out[name] = stripUndefined({
          type: "http",
          scheme: "basic",
          description: def.description,
        });
        break;
      case "apiKey":
        out[name] = stripUndefined({
          type: "apiKey",
          name: def.name,
          in: def.in,
          description: def.description,
        });
        break;
      case "oauth2": {
        const scopes = (def.scopes && typeof def.scopes === "object" ? def.scopes : {}) as AnyRecord;
        const flows: AnyRecord = {};
        switch (def.flow) {
          case "implicit":
            flows.implicit = stripUndefined({ authorizationUrl: def.authorizationUrl, scopes });
            break;
          case "password":
            flows.password = stripUndefined({ tokenUrl: def.tokenUrl, scopes });
            break;
          case "application":
            flows.clientCredentials = stripUndefined({ tokenUrl: def.tokenUrl, scopes });
            break;
          case "accessCode":
            flows.authorizationCode = stripUndefined({
              authorizationUrl: def.authorizationUrl,
              tokenUrl: def.tokenUrl,
              scopes,
            });
            break;
          default:
            break;
        }
        out[name] = stripUndefined({ type: "oauth2", description: def.description, flows });
        break;
      }
      default:
        // Unknown scheme type: pass through (caller is lenient).
        out[name] = def;
    }
  }
  return out;
}

// ---- paths / operations ----

function convertPaths(paths: AnyRecord, globalConsumes: string[], globalProduces: string[]): AnyRecord {
  const out: AnyRecord = {};
  for (const [rawPath, rawItem] of Object.entries(paths)) {
    if (!rawItem || typeof rawItem !== "object") continue;
    // Path-level $ref is legal in both specs — leave it for the dereferencer.
    if ((rawItem as AnyRecord).$ref) {
      out[rawPath] = rawItem;
      continue;
    }
    out[rawPath] = convertPathItem(rawItem as AnyRecord, globalConsumes, globalProduces);
  }
  return out;
}

function convertPathItem(
  item: AnyRecord,
  globalConsumes: string[],
  globalProduces: string[]
): AnyRecord {
  const out: AnyRecord = {};

  const pathLevelParams = Array.isArray(item.parameters) ? item.parameters : [];
  const pathLevelNonBody: AnyRecord[] = [];
  const pathLevelBody: AnyRecord[] = [];
  const pathLevelFormData: AnyRecord[] = [];
  for (const p of pathLevelParams) {
    if (!p || typeof p !== "object") continue;
    const pr = p as AnyRecord;
    if (pr.in === "body") pathLevelBody.push(pr);
    else if (pr.in === "formData") pathLevelFormData.push(pr);
    else pathLevelNonBody.push(pr);
  }
  if (pathLevelNonBody.length) {
    out.parameters = pathLevelNonBody.map(convertParameter);
  }

  for (const method of HTTP_METHODS) {
    const op = item[method];
    if (!op || typeof op !== "object") continue;
    out[method] = convertOperation(
      op as AnyRecord,
      globalConsumes,
      globalProduces,
      pathLevelBody,
      pathLevelFormData
    );
  }
  return out;
}

function convertOperation(
  op: AnyRecord,
  globalConsumes: string[],
  globalProduces: string[],
  pathLevelBody: AnyRecord[],
  pathLevelFormData: AnyRecord[]
): AnyRecord {
  const out: AnyRecord = {};
  for (const key of ["summary", "description", "operationId", "tags", "deprecated", "security", "externalDocs"]) {
    if (op[key] !== undefined) out[key] = op[key];
  }

  const consumes = Array.isArray(op.consumes) ? op.consumes : globalConsumes;
  const produces = Array.isArray(op.produces) ? op.produces : globalProduces;

  const rawParams = Array.isArray(op.parameters) ? op.parameters : [];
  const nonBody: AnyRecord[] = [];
  const bodyParams: AnyRecord[] = [...pathLevelBody];
  const formDataParams: AnyRecord[] = [...pathLevelFormData];
  for (const p of rawParams) {
    if (!p || typeof p !== "object") continue;
    const pr = p as AnyRecord;
    if (pr.in === "body") bodyParams.push(pr);
    else if (pr.in === "formData") formDataParams.push(pr);
    else nonBody.push(pr);
  }

  if (nonBody.length) out.parameters = nonBody.map(convertParameter);

  // requestBody: body wins over formData; only one is valid in OpenAPI 3.
  if (bodyParams.length > 0) {
    const body = bodyParams[0];
    const types = consumes.length ? consumes : ["application/json"];
    const content: AnyRecord = {};
    for (const mt of types) {
      content[mt] = { schema: body.schema ?? {} };
    }
    out.requestBody = stripUndefined({
      description: body.description,
      required: body.required ?? false,
      content,
    });
  } else if (formDataParams.length > 0) {
    const hasFile = formDataParams.some((p) => p.type === "file");
    const mediaType = hasFile
      ? "multipart/form-data"
      : consumes.includes("application/x-www-form-urlencoded")
        ? "application/x-www-form-urlencoded"
        : consumes.includes("multipart/form-data")
          ? "multipart/form-data"
          : "application/x-www-form-urlencoded";

    const properties: AnyRecord = {};
    const required: string[] = [];
    for (const p of formDataParams) {
      const schema = primitiveToSchema(p);
      if (p.description && !schema.description) schema.description = p.description;
      properties[p.name] = schema;
      if (p.required) required.push(p.name);
    }
    out.requestBody = {
      required: required.length > 0,
      content: {
        [mediaType]: {
          schema: {
            type: "object",
            properties,
            ...(required.length ? { required } : {}),
          },
        },
      },
    };
  }

  // Responses
  if (op.responses && typeof op.responses === "object") {
    const responses: AnyRecord = {};
    for (const [status, resp] of Object.entries(op.responses)) {
      if (!resp || typeof resp !== "object") continue;
      responses[status] = convertResponse(resp as AnyRecord, produces);
    }
    out.responses = responses;
  }

  return out;
}

function convertParameter(p: AnyRecord): AnyRecord {
  // Swagger 2.0 non-body param → OpenAPI 3 param with `schema`
  const out: AnyRecord = {
    name: p.name,
    in: p.in,
    description: p.description,
    required: p.in === "path" ? true : p.required ?? false,
  };
  if (p.$ref) return { $ref: p.$ref };
  out.schema = p.schema ? p.schema : primitiveToSchema(p);

  // collectionFormat → style / explode (best-effort mapping)
  switch (p.collectionFormat) {
    case "csv":
      if (p.in === "query") {
        out.style = "form";
        out.explode = false;
      } else if (p.in === "header" || p.in === "path") {
        out.style = "simple";
      }
      break;
    case "ssv":
      out.style = "spaceDelimited";
      out.explode = false;
      break;
    case "pipes":
      out.style = "pipeDelimited";
      out.explode = false;
      break;
    case "multi":
      out.style = "form";
      out.explode = true;
      break;
  }

  return stripUndefined(out);
}

function primitiveToSchema(p: AnyRecord): AnyRecord {
  const schema: AnyRecord = {};
  for (const key of PRIMITIVE_SCHEMA_KEYS) {
    const v = p[key];
    if (v !== undefined) schema[key] = v;
  }
  // Swagger 2.0 `file` → OpenAPI 3 binary string
  if (schema.type === "file") {
    schema.type = "string";
    schema.format = "binary";
  }
  return schema;
}

function convertResponse(resp: AnyRecord, produces: string[]): AnyRecord {
  if (resp.$ref) return { $ref: resp.$ref };
  const out: AnyRecord = {
    description: typeof resp.description === "string" ? resp.description : "",
  };
  if (resp.headers && typeof resp.headers === "object") {
    const headers: AnyRecord = {};
    for (const [name, h] of Object.entries(resp.headers)) {
      if (!h || typeof h !== "object") continue;
      headers[name] = stripUndefined({
        description: (h as AnyRecord).description,
        schema: primitiveToSchema(h as AnyRecord),
      });
    }
    if (Object.keys(headers).length) out.headers = headers;
  }
  if (resp.schema) {
    const types = produces.length ? produces : ["application/json"];
    const content: AnyRecord = {};
    for (const mt of types) {
      const media: AnyRecord = { schema: resp.schema };
      if (resp.examples && typeof resp.examples === "object" && (resp.examples as AnyRecord)[mt] !== undefined) {
        media.example = (resp.examples as AnyRecord)[mt];
      }
      content[mt] = media;
    }
    out.content = content;
  }
  return out;
}

// ---- $ref rewriting ----

const REF_REWRITES: Array<{ from: string; to: string }> = [
  { from: "#/definitions/", to: "#/components/schemas/" },
  { from: "#/parameters/", to: "#/components/parameters/" },
  { from: "#/responses/", to: "#/components/responses/" },
  { from: "#/securityDefinitions/", to: "#/components/securitySchemes/" },
];

function rewriteRefs(root: unknown): void {
  const seen = new WeakSet<object>();
  function walk(node: any): void {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (typeof node.$ref === "string") {
      for (const r of REF_REWRITES) {
        if (node.$ref.startsWith(r.from)) {
          node.$ref = r.to + node.$ref.slice(r.from.length);
          break;
        }
      }
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const key of Object.keys(node)) walk(node[key]);
  }
  walk(root);
}

// ---- helpers ----

function stripUndefined<T extends AnyRecord>(obj: T): T {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
}
