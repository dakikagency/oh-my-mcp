import { hc } from "hono/client";
import type { AppType } from "@/server/hono";
import { getAppOrigin } from "@/lib/utils";

/**
 * Typed Hono RPC client. Usage:
 *
 *   const res = await api.me.$get();
 *
 * The Hono app is mounted with `basePath("/api")`, so `hc<AppType>` exposes
 * the route tree under `.api`. We strip that prefix here so callers can
 * write `api.servers.*` instead of `api.api.servers.*`.
 */
export function getRpc(baseUrl?: string) {
  return hc<AppType>(baseUrl ?? getAppOrigin(), {
    fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        // Always include cookies for same-origin calls (auth session).
        credentials: "include",
      })) as typeof fetch,
  }).api;
}

export const api = getRpc();
export type Rpc = ReturnType<typeof getRpc>;
