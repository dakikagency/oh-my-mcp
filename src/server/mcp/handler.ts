/**
 * Minimal, Worker-compatible MCP Streamable HTTP server.
 *
 * Implements the subset of the MCP spec required by standard clients
 * (Claude Desktop, Cursor, etc.):
 *   - `POST /mcp/:slug`  → JSON-RPC 2.0 request/response
 *   - `GET  /mcp/:slug`  → SSE-style event stream for server-initiated events
 *     (we keep it open but emit nothing today; clients that expect a
 *     persistent stream accept a trickle of keepalive comments).
 *
 * Supported methods:
 *   - `initialize`
 *   - `tools/list`
 *   - `tools/call`
 *   - `ping`
 *
 * Everything heavier (resources, prompts, progress notifications) is
 * declared unsupported in the initialize response so clients don't hang
 * waiting for them.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { PrismaClient } from "@prisma/client";
import { sha256Hex, timingSafeEqualHex } from "@/lib/crypto";
import { executeTool } from "./executor";

const PROTOCOL_VERSION = "2025-03-26";

export interface McpHandlerDeps {
  db: PrismaClient;
  encryptionKey: string;
}

export async function handleMcpRequest(
  req: Request,
  slug: string,
  deps: McpHandlerDeps
): Promise<Response> {
  const server = await deps.db.mcpServer.findUnique({
    where: { slug },
    include: {
      tools: { where: { enabled: true } },
      apiKeys: true,
    },
  });
  if (!server) return jsonRpcHttp(404, "Server not found.");

  const authOk = await checkAccess(req, server, deps);
  if (!authOk) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "www-authenticate": 'Bearer realm="oh-my-mcp"' },
    });
  }

  if (req.method === "GET") return openEventStream();
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  // Batched requests — MCP permits JSON-RPC batches.
  if (Array.isArray(payload)) {
    const responses = await Promise.all(
      payload.map((p) => dispatch(p, server, deps))
    );
    return json(responses.filter((r) => r !== null));
  }

  const res = await dispatch(payload, server, deps);
  return res ? json(res) : new Response(null, { status: 204 });
}

// ---- Dispatch ----

async function dispatch(
  req: any,
  server: Awaited<ReturnType<PrismaClient["mcpServer"]["findUnique"]>> & {
    tools: any[];
    apiKeys: any[];
  },
  deps: McpHandlerDeps
): Promise<any | null> {
  if (!req || typeof req !== "object") {
    return rpcError(null, -32600, "Invalid Request");
  }
  const { id = null, method, params } = req;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize":
        return rpcOk(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: server!.name,
            version: "1.0.0",
          },
          instructions: server!.description ?? undefined,
        });

      case "notifications/initialized":
        return null;

      case "ping":
        return rpcOk(id, {});

      case "tools/list": {
        const tools = server!.tools.map((t: any) => ({
          name: t.name,
          description: t.description ?? t.summary ?? undefined,
          inputSchema: t.inputSchema,
        }));
        return rpcOk(id, { tools });
      }

      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments ?? {};
        if (!name) return rpcError(id, -32602, "Missing tool name.");

        const tool = server!.tools.find((t: any) => t.name === name);
        if (!tool) return rpcError(id, -32601, `Unknown tool: ${name}`);

        const started = Date.now();
        try {
          const result = await executeTool({
            baseUrl: server!.baseUrl,
            tool,
            args,
            apiKeys: server!.apiKeys,
            encryptionKey: deps.encryptionKey,
          });

          await deps.db.mcpCallLog.create({
            data: {
              serverId: server!.id,
              toolName: name,
              status: result.status,
              latencyMs: result.latencyMs,
            },
          }).catch(() => {
            /* logging best-effort */
          });

          return rpcOk(id, {
            content: [
              {
                type: "text",
                text:
                  result.json !== null
                    ? JSON.stringify(result.json, null, 2)
                    : result.body,
              },
            ],
            isError: result.status >= 400,
            _meta: {
              status: result.status,
              contentType: result.contentType,
              latencyMs: result.latencyMs,
            },
          });
        } catch (err) {
          const message = (err as Error)?.message ?? "Tool execution failed.";
          await deps.db.mcpCallLog.create({
            data: {
              serverId: server!.id,
              toolName: name,
              status: 0,
              latencyMs: Date.now() - started,
              errorCode: "execute_failed",
            },
          }).catch(() => {});
          return rpcOk(id, {
            content: [{ type: "text", text: `Error: ${message}` }],
            isError: true,
          });
        }
      }

      default:
        if (isNotification) return null;
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    console.error("[mcp] dispatch error", err);
    return rpcError(id, -32603, "Internal error");
  }
}

// ---- Access control ----

async function checkAccess(
  req: Request,
  server: { id: string; visibility: string },
  deps: McpHandlerDeps
): Promise<boolean> {
  if (server.visibility === "PUBLIC") return true;

  const auth = req.headers.get("authorization");
  if (!auth) return server.visibility === "UNLISTED";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const raw = m[1].trim();
  const hash = await sha256Hex(raw);

  const token = await deps.db.mcpAccessToken.findFirst({
    where: { serverId: server.id, tokenHash: hash, revokedAt: null },
  });
  if (!token) return false;
  if (token.expiresAt && token.expiresAt < new Date()) return false;
  if (!timingSafeEqualHex(token.tokenHash, hash)) return false;

  // Best-effort last-used stamp.
  deps.db.mcpAccessToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return true;
}

// ---- Helpers ----

function rpcOk(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function jsonRpcHttp(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonRpcError(id: unknown, code: number, message: string): Response {
  return json(rpcError(id, code, message));
}

function openEventStream(): Response {
  // Empty SSE stream — keeps the connection open for clients that insist
  // on the GET endpoint, but we never emit server-initiated events (yet).
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(":ok\n\n"));
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
