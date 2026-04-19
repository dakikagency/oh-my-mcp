import Link from "next/link";
import { ArrowRightIcon, StackIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";

import { getDashboardContext } from "@/server/session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { VisibilityBadge } from "@/components/dashboard/visibility-badge";

export const dynamic = "force-dynamic";

export default async function ServersPage() {
  const { db, orgId } = await getDashboardContext();
  const servers = await db.mcpServer.findMany({
    where: { organizationId: orgId },
    include: {
      _count: { select: { tools: true } },
      openApiDoc: { select: { title: true, version: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Servers</h1>
          <p className="text-sm text-muted-foreground">
            MCP servers compiled from OpenAPI documents in this organization.
          </p>
        </div>
        <Button asChild>
          <Link href="/servers/new">
            <PlusIcon className="h-4 w-4" /> New server
          </Link>
        </Button>
      </div>

      {servers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <StackIcon weight="duotone" className="h-10 w-10 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">No servers yet</CardTitle>
              <CardDescription className="mt-1">
                Paste an OpenAPI URL or document — we&apos;ll host the MCP endpoint.
              </CardDescription>
            </div>
            <Button asChild>
              <Link href="/servers/new">
                Create server <ArrowRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {servers.map((s) => (
            <Link
              key={s.id}
              href={`/servers/${s.id}`}
              className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium group-hover:text-primary">
                      {s.name}
                    </h3>
                    <VisibilityBadge visibility={s.visibility} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    /{s.slug} · {s.openApiDoc?.title} v{s.openApiDoc?.version}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {s._count.tools} tools
                </Badge>
              </div>
              {s.description ? (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                  {s.description}
                </p>
              ) : null}
              <p className="mt-3 truncate font-mono text-xs text-muted-foreground">
                {s.baseUrl}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

