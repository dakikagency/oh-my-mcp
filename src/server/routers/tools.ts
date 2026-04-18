import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";

import type { Env } from "../context";
import { requireOrg, loadServer } from "../guards";
import { updateToolSchema } from "@/lib/schemas";

export const toolsRouter = new Hono<Env>()
  .use("*", requireOrg)

  .get("/", async (c) => {
    const serverId = c.req.param("serverId")!;
    const server = await loadServer(c, serverId);
    const tools = await c.var.db.mcpTool.findMany({
      where: { serverId: server.id },
      orderBy: { name: "asc" },
    });
    return c.json({ tools });
  })

  .get("/:toolId", async (c) => {
    const serverId = c.req.param("serverId")!;
    const toolId = c.req.param("toolId");
    await loadServer(c, serverId);
    const tool = await c.var.db.mcpTool.findFirst({
      where: { id: toolId, serverId },
    });
    if (!tool) throw new HTTPException(404, { message: "Tool not found." });
    return c.json({ tool });
  })

  .patch(
    "/:toolId",
    zValidator("json", updateToolSchema),
    async (c) => {
      const serverId = c.req.param("serverId")!;
      const toolId = c.req.param("toolId");
      await loadServer(c, serverId);
      const body = c.req.valid("json");
      const tool = await c.var.db.mcpTool.update({
        where: { id: toolId },
        data: {
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
        },
      });
      return c.json({ tool });
    }
  );

export type ToolsRouter = typeof toolsRouter;
