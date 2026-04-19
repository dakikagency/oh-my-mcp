import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma, type PrismaClient } from "@prisma/client";

import { auth } from "./auth";
import { getDb } from "@/lib/db";
import { randomSuffix, slugCandidates, slugify } from "@/lib/utils";

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

/**
 * Requires both an authenticated user and an active organization.
 *
 * If the session has no active org we first try to reuse an existing
 * membership. Failing that, a personal workspace is created transparently
 * so the happy path never routes through `/onboarding` — the dedicated
 * page is kept as a last-resort fallback for the rare case where even the
 * server-side create fails.
 */
export async function requireOrgSession() {
  const session = await requireSession();
  const existing = session.session?.activeOrganizationId ?? null;
  if (existing) return { session, orgId: existing };

  const db = getDb();
  const ensuredOrgId = await ensureActiveOrg(db, {
    userId: session.user.id,
    userName: session.user.name,
    sessionId: session.session!.id,
  });
  if (!ensuredOrgId) redirect("/onboarding");
  return { session, orgId: ensuredOrgId };
}

/** Convenience: returns { session, orgId, db } for dashboard RSCs. */
export async function getDashboardContext() {
  const { session, orgId } = await requireOrgSession();
  const db = getDb();
  return { session, orgId, db };
}

// ---- Internals ----

/**
 * Returns an organization ID the user is a member of, activating an
 * existing membership first or creating a personal workspace as a last
 * step. The active org is persisted on the session row so future requests
 * skip this path. Returns `null` only if every candidate slug collided.
 */
async function ensureActiveOrg(
  db: PrismaClient,
  input: { userId: string; userName: string; sessionId: string }
): Promise<string | null> {
  // 1. Reuse an existing membership if one exists (oldest first so we
  // land on the user's primary workspace rather than an invite).
  const membership = await db.member.findFirst({
    where: { userId: input.userId },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });
  if (membership) {
    await activateOrg(db, input.sessionId, membership.organizationId);
    return membership.organizationId;
  }

  // 2. Otherwise create a personal org. Retry on slug collisions.
  const firstName = input.userName.split(" ")[0] || "my";
  const orgName = `${firstName}'s Workspace`;
  const baseSlug = slugify(orgName) || `ws-${randomSuffix(8)}`;

  for (const slug of slugCandidates(baseSlug)) {
    try {
      const orgId = randomId();
      const now = new Date();
      await db.$transaction([
        db.organization.create({
          data: { id: orgId, name: orgName, slug, createdAt: now },
        }),
        db.member.create({
          data: {
            id: randomId(),
            organizationId: orgId,
            userId: input.userId,
            role: "owner",
            createdAt: now,
          },
        }),
      ]);
      await activateOrg(db, input.sessionId, orgId);
      return orgId;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue;
      }
      throw err;
    }
  }
  return null;
}

async function activateOrg(
  db: PrismaClient,
  sessionId: string,
  organizationId: string
): Promise<void> {
  await db.session.update({
    where: { id: sessionId },
    data: { activeOrganizationId: organizationId },
  });
}

function randomId(): string {
  // Matches better-auth's ID format (random URL-safe ~24 chars). We avoid
  // `crypto.randomUUID()` so the IDs remain compact and cookie-friendly.
  return (
    randomSuffix(10) + randomSuffix(10) + Date.now().toString(36)
  ).slice(0, 24);
}
