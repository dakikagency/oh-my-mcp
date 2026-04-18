import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./auth";
import { getDb } from "@/lib/db";

/** Reads the current session from request headers. Returns null if none. */
export async function getSession() {
  const h = await headers();
  return auth.api.getSession({ headers: h });
}

/** Requires an authenticated user. Redirects to /sign-in otherwise. */
export async function requireSession() {
  const session = await getSession();
  if (!session?.user) redirect("/sign-in");
  return session;
}

/** Requires both an authenticated user and an active organization. */
export async function requireOrgSession() {
  const session = await requireSession();
  const orgId = session.session?.activeOrganizationId ?? null;
  if (!orgId) redirect("/dashboard/onboarding");
  return { session, orgId };
}

/** Convenience: returns { session, orgId, db } for dashboard RSCs. */
export async function getDashboardContext() {
  const { session, orgId } = await requireOrgSession();
  const db = getDb();
  return { session, orgId, db };
}
