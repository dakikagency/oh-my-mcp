"use client";

import { toast } from "sonner";

import { api } from "./rpc";

export { api };

/** Pre-bound sub-client for per-server routes. Callers still pass
 * `param: { serverId }`, but the Hono-RPC template string stays in one place. */
export const serverRpc = api.servers[":serverId"];

interface MutateOptions {
  /** Override the toast message when the server did not return one. */
  error?: string;
  /** Show a success toast when the request resolves 2xx. */
  success?: string;
  /** Suppress toasts entirely; the caller takes full responsibility for UX. */
  silent?: boolean;
}

/**
 * Thin wrapper around a typed Hono RPC call.
 *
 * On non-2xx it surfaces the server-provided `message` as a toast and
 * returns `null`; on success it returns the parsed body. Callers should
 * narrow the generic `T` to the known response shape of the endpoint.
 */
export async function apiMutate<T>(
  run: () => Promise<Response>,
  options?: MutateOptions
): Promise<T | null> {
  try {
    const res = await run();
    if (!res.ok) {
      if (!options?.silent) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(body.message ?? options?.error ?? "Something went wrong.");
      }
      return null;
    }
    const data = (await res.json()) as T;
    if (options?.success) toast.success(options.success);
    return data;
  } catch (err) {
    if (!options?.silent) {
      toast.error(
        options?.error ?? (err instanceof Error ? err.message : "Request failed.")
      );
    }
    return null;
  }
}

/**
 * Same toast semantics as `apiMutate`, but for fire-and-forget calls where
 * the caller only cares whether the request succeeded. Returns `true` on
 * 2xx, `false` otherwise.
 */
export async function apiAction(
  run: () => Promise<Response>,
  options?: MutateOptions
): Promise<boolean> {
  const result = await apiMutate<unknown>(run, options);
  return result !== null;
}
