import { z } from "zod";

export const cuid = z.string().min(1);
export const slug = z
  .string()
  .min(3, "At least 3 characters.")
  .max(48, "Too long.")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i, "Use letters, numbers, and hyphens.");

export const visibilityEnum = z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]);
export const authTypeEnum = z.enum(["NONE", "BEARER", "HEADER", "QUERY", "BASIC"]);
export const openApiSourceEnum = z.enum(["UPLOAD", "URL", "PASTE"]);

// ---- MCP servers ----

export const createServerSchema = z.object({
  name: z.string().min(1).max(80),
  slug: slug,
  description: z.string().max(500).optional().nullable(),
  baseUrl: z.string().url().optional().nullable(),
  visibility: visibilityEnum.default("PRIVATE"),
  openApiDocId: cuid,
});

export const updateServerSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  slug: slug.optional(),
  description: z.string().max(500).nullable().optional(),
  baseUrl: z.string().url().nullable().optional(),
  visibility: visibilityEnum.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// ---- OpenAPI ingest ----

export const ingestFromUrlSchema = z.object({
  url: z.string().url(),
});

export const ingestFromTextSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  // JSON or YAML text
  content: z.string().min(10),
  source: openApiSourceEnum.default("PASTE"),
});

// ---- Quick create (one-shot: ingest + create server) ----

export const quickCreateServerSchema = z.object({
  // URL or raw OpenAPI document (JSON/YAML). We detect which at runtime.
  input: z.string().min(1).max(5_000_000),
});

// ---- Tools ----

export const updateToolSchema = z.object({
  enabled: z.boolean().optional(),
  description: z.string().max(800).nullable().optional(),
});

// ---- API keys (upstream credentials) ----

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(80),
  type: authTypeEnum,
  paramName: z.string().min(1).max(80).optional().nullable(),
  schemeKey: z.string().max(80).optional().nullable(),
  secret: z.string().min(1),
});

// ---- Access tokens (inbound, sent by MCP clients) ----

export const createAccessTokenSchema = z.object({
  name: z.string().min(1).max(80),
  expiresAt: z.string().datetime().optional().nullable(),
});

// ---- Organizations ----

export const createOrgSchema = z.object({
  name: z.string().min(1).max(80),
  slug: slug,
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]).default("member"),
});

export const setActiveOrgSchema = z.object({
  orgId: cuid,
});

export type CreateServerInput = z.infer<typeof createServerSchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;
export type IngestFromUrlInput = z.infer<typeof ingestFromUrlSchema>;
export type IngestFromTextInput = z.infer<typeof ingestFromTextSchema>;
export type QuickCreateServerInput = z.infer<typeof quickCreateServerSchema>;
export type UpdateToolInput = z.infer<typeof updateToolSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type CreateAccessTokenInput = z.infer<typeof createAccessTokenSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type SetActiveOrgInput = z.infer<typeof setActiveOrgSchema>;

export type Visibility = z.infer<typeof visibilityEnum>;
export type AuthType = z.infer<typeof authTypeEnum>;
export type OpenApiSource = z.infer<typeof openApiSourceEnum>;
