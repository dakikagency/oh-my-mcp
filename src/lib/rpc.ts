import { hc } from "hono/client";
import type { AppType } from "@/server/hono";

/**
 * Typed Hono RPC client. Usage:
 *
 *   const { data } = await api.me.$get().then((r) => r.json());
 */
export function getRpc(baseUrl?: string) {
  const origin =
    baseUrl ??
    (typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  // The Hono app is mounted with basePath("/api"), so we pass the bare origin
  // here — `hc` already folds the basePath into the client tree.
  return hc<AppType>(origin, {
    fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        // Always include cookies for same-origin calls (auth session).
        credentials: "include",
      })) as typeof fetch,
  });
}

export const api = getRpc();
export type Rpc = ReturnType<typeof getRpc>;
