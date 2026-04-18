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
    // Bound memory while streaming: stop reading as soon as `max` bytes
    // have been accumulated, then abort the connection. Reading the
    // full body before truncation would defeat the cap and let large
    // upstream responses exhaust the worker.
    const { text: raw, truncated } = await readBoundedText(res, max, ac);
    const clipped = truncated ? raw + "…[truncated]" : raw;
    let json: unknown = null;
    if (!truncated && contentType?.includes("application/json")) {
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
    // Require an exact scheme match. Falling back to opts.apiKeys[0]
    // when the requested scheme is missing risks leaking the wrong
    // credential (e.g. a Bearer being sent as a query param) to an
    // upstream that never should have seen it. Fail closed instead.
    const match = opts.apiKeys.find((k) => k.schemeKey === schemeKey);
    if (!match) {
      console.warn(
        `[executor] skipping auth injection: no credential matches scheme "${schemeKey}"`
      );
      continue;
    }
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

/**
 * Read a Response body as UTF-8 text, stopping as soon as `maxBytes`
 * bytes have been accumulated. When the limit is hit the underlying
 * fetch is aborted so we don't keep pulling data from the upstream.
 *
 * This is the streamed counterpart of `res.text()` — the latter
 * materialises the entire payload before we can enforce a cap,
 * which defeats the purpose of a memory limit.
 */
async function readBoundedText(
  res: Response,
  maxBytes: number,
  ac: AbortController
): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks: string[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        chunks.push(decoder.decode(value.slice(0, remaining), { stream: true }));
        total = maxBytes;
        truncated = true;
        break;
      }
      chunks.push(decoder.decode(value, { stream: true }));
      total += value.byteLength;
    }
    chunks.push(decoder.decode());
  } finally {
    if (truncated) {
      ac.abort();
      try {
        await reader.cancel();
      } catch {
        /* already aborted */
      }
    }
  }
  return { text: chunks.join(""), truncated };
}
