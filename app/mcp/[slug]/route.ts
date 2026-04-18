import { getDb } from "@/lib/db";
import { handleMcpRequest } from "@/server/mcp/handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function dispatch(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const db = getDb();
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return new Response(
      JSON.stringify({ error: "server_misconfigured", message: "ENCRYPTION_KEY not set." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
  return handleMcpRequest(req, slug, { db, encryptionKey });
}

export const GET = dispatch;
export const POST = dispatch;
export const DELETE = dispatch;
