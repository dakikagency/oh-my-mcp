import { HTTPException } from "hono/http-exception";
import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "./context";

/** Requires an authenticated session. Sets `c.var.session.user` as non-null afterwards. */
export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  const session = c.var.session;
  if (!session?.user) {
    throw new HTTPException(401, { message: "Sign in required." });
  }
  await next();
};

/** Requires an active organization on the session. Populates `c.var.orgId`. */
export const requireOrg: MiddlewareHandler<Env> = async (c, next) => {
  const session = c.var.session;
  if (!session?.user) {
    throw new HTTPException(401, { message: "Sign in required." });
  }
  if (!c.var.orgId) {
    throw new HTTPException(400, {
      message: "No active organization — create or select one first.",
    });
  }
  await next();
};

/** Asserts the current user is a member of the given org. */
export async function assertMember(c: Context<Env>, organizationId: string) {
  const userId = c.var.session?.user?.id;
  if (!userId) throw new HTTPException(401, { message: "Sign in required." });
  const member = await c.var.db.member.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!member) throw new HTTPException(403, { message: "Not a member of this organization." });
  return member;
}

/** Ensures an `McpServer` belongs to the current active org. */
export async function loadServer(c: Context<Env>, serverId: string) {
  if (!c.var.orgId) throw new HTTPException(400, { message: "No active organization." });
  const server = await c.var.db.mcpServer.findFirst({
    where: { id: serverId, organizationId: c.var.orgId },
  });
  if (!server) throw new HTTPException(404, { message: "Server not found." });
  return server;
}
