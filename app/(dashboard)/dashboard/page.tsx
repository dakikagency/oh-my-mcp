import Link from "next/link";
import { ArrowRightIcon, StackIcon, UsersIcon, KeyIcon, LightningIcon } from "@phosphor-icons/react/dist/ssr";

import { getDashboardContext } from "@/server/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { db, orgId } = await getDashboardContext();

  const [serverCount, toolCount, keyCount, tokenCount, recentServers] = await Promise.all([
    db.mcpServer.count({ where: { organizationId: orgId } }),
    db.mcpTool.count({ where: { server: { organizationId: orgId } } }),
    db.mcpApiKey.count({ where: { server: { organizationId: orgId } } }),
    db.mcpAccessToken.count({ where: { server: { organizationId: orgId } } }),
    db.mcpServer.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        _count: { select: { tools: true } },
        openApiDoc: { select: { title: true, version: true } },
      },
    }),
  ]);

  const stats = [
    { label: "Servers", value: serverCount, icon: StackIcon },
    { label: "Tools", value: toolCount, icon: LightningIcon },
    { label: "Upstream keys", value: keyCount, icon: KeyIcon },
    { label: "Access tokens", value: tokenCount, icon: UsersIcon },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Your MCP gateway at a glance.
          </p>
        </div>
        <Button asChild>
          <Link href="/servers/new">
            New server <ArrowRightIcon className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
              </div>
              <s.icon weight="duotone" className="h-6 w-6 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent servers</CardTitle>
          <CardDescription>Your most recently updated MCP servers.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentServers.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-border">
              {recentServers.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/servers/${s.id}`}
                      className="font-medium hover:underline"
                    >
                      {s.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {s._count.tools} tools · {s.openApiDoc?.title} v{s.openApiDoc?.version} · /{s.slug}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/servers/${s.id}`}>Open</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <StackIcon weight="duotone" className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Paste an OpenAPI URL to create your first MCP server.
      </p>
      <Button asChild>
        <Link href="/servers/new">
          Create your first server <ArrowRightIcon className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
