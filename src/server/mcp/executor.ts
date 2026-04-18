/**
 * Outbound HTTP executor: takes a compiled `McpTool` (from the DB) plus the
 * caller-supplied JSON arguments and performs the real upstream request.
 *
 * Security scheme binding:
 *   - For each `securityKey` on the tool, we look up an `McpApiKey` whose
 *     `schemeKey` matches (or falls back to type-only matches if absent).
 *   - Secrets are decrypted with `ENCRYPTION_KEY` right before the request.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { McpApiKey, McpTool } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";

export interface ExecuteOptions {
  baseUrl: string;
  tool: McpTool;
  args: unknown;
  apiKeys: McpApiKey[];
  encryptionKey: string;
  /** Max outbound response body length (in bytes) before we truncate. */
  maxResponseBytes?: number;
  /** Hard timeout for upstream call in ms. */
  timeoutMs?: number;
}

export interface ExecuteResult {
  status: number;
  contentType: string | null;
  body: string;
  json: unknown;
  latencyMs: number;
}

interface Wire {
  path: Array<{ name: string }>;
  query: Array<{ name: string; style?: string; explode?: boolean }>;
  header: Array<{ name: string }>;
  body:
    | { kind: "json" }
    | { kind: "form"; contentType: string }
    | { kind: "none" };
}

export async function executeTool(opts: ExecuteOptions): Promise<ExecuteResult> {
  const started = Date.now();
  const wire = opts.tool.wire as unknown as Wire;
  const argsObj = (opts.args && typeof opts.args === "object" ? opts.args : {}) as Record<
    string,
    unknown
  >;

  // 1. Build URL with path substitution and query string.
  let url = joinUrl(opts.baseUrl, opts.tool.path);
  for (const p of wire.path) {
    const v = argsObj[p.name];
    if (v === undefined || v === null) {
      throw new Error(`Missing required path parameter "${p.name}".`);
    }
    url = url.replace(
      new RegExp(`\\{${escapeRegExp(p.name)}\\}`, "g"),
      encodeURIComponent(String(v))
    );
  }

  const qs = new URLSearchParams();
  for (const q of wire.query) {
    const v = argsObj[q.name];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      // `explode: false` → comma join, otherwise append multiple.
      if (q.explode === false) qs.append(q.name, v.join(","));
      else for (const item of v) qs.append(q.name, String(item));
    } else if (typeof v === "object") {
      qs.append(q.name, JSON.stringify(v));
    } else {
      qs.append(q.name, String(v));
    }
  }
  const qsString = qs.toString();
  if (qsString) url += (url.includes("?") ? "&" : "?") + qsString;

  // 2. Headers.
  const headers: Record<string, string> = {
    accept: "application/json, text/plain;q=0.8, */*;q=0.5",
  };
  for (const h of wire.header) {
    const v = argsObj[h.name];
    if (v !== undefined && v !== null) headers[h.name] = String(v);
  }

  // 3. Auth injection.
  url = await applyAuth(headers, url, opts);

  // 4. Body.
  let body: BodyInit | undefined;
  if (wire.body.kind === "json") {
    headers["content-type"] = "application/json";
    body = JSON.stringify((argsObj as any).body ?? null);
  } else if (wire.body.kind === "form") {
    headers["content-type"] = wire.body.contentType;
    const form = new URLSearchParams();
    const b = (argsObj as any).body;
    if (b && typeof b === "object") {
      for (const [k, v] of Object.entries(b)) {
        if (Array.isArray(v)) for (const it of v) form.append(k, String(it));
        else if (v !== undefined && v !== null) form.append(k, String(v));
      }
    }
    body = form.toString();
  }

  // 5. Fire with timeout.
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      method: opts.tool.method,
      headers,
      body,
      signal: ac.signal,
      redirect: "follow",
    });
    const contentType = res.headers.get("content-type");
    const max = opts.maxResponseBytes ?? 1_000_000;
    const raw = await res.text();
    const clipped = raw.length > max ? raw.slice(0, max) + "…[truncated]" : raw;
    let json: unknown = null;
    if (contentType?.includes("application/json")) {
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }
    }
    return {
      status: res.status,
      contentType,
      body: clipped,
      json,
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function applyAuth(
  headers: Record<string, string>,
  url: string,
  opts: ExecuteOptions
): Promise<string> {
  const needed = opts.tool.securityKeys ?? [];
  if (!needed.length || opts.apiKeys.length === 0) return url;

  let currentUrl = url;
  for (const schemeKey of needed) {
    const match =
      opts.apiKeys.find((k) => k.schemeKey === schemeKey) ?? opts.apiKeys[0];
    if (!match) continue;
    const secret = await decryptSecret(match.secretCipher, opts.encryptionKey);
    switch (match.type) {
      case "BEARER":
        headers["authorization"] = `Bearer ${secret}`;
        break;
      case "HEADER":
        if (match.paramName) headers[match.paramName] = secret;
        break;
      case "QUERY": {
        if (match.paramName) {
          const u = new URL(currentUrl);
          u.searchParams.set(match.paramName, secret);
          currentUrl = u.toString();
        }
        break;
      }
      case "BASIC": {
        // Secret stored as `user:pass`.
        const encoded = btoa(secret);
        headers["authorization"] = `Basic ${encoded}`;
        break;
      }
      case "NONE":
      default:
        break;
    }
  }
  return currentUrl;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
