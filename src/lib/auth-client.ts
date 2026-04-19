"use client";

import { createAuthClient } from "better-auth/react";

import { getAppOrigin } from "@/lib/utils";

/**
 * Thin better-auth client used only for authentication flows
 * (sign-in / sign-up / sign-out). All organization operations go through
 * the typed Hono RPC at `@/lib/api` so there is a single server boundary.
 */
export const authClient = createAuthClient({
  baseURL: getAppOrigin(),
});

export const { signIn, signUp, signOut } = authClient;
