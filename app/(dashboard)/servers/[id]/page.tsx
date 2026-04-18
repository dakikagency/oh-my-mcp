import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, Lock, Eye } from "@phosphor-icons/react/dist/ssr";

import { getDashboardContext } from "@/server/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolsList } from "@/components/dashboard/tools-list";
import { AccessTokensPanel } from "@/components/dashboard/access-tokens-panel";
import { ApiKeysPanel } from "@/components/dashboard/api-keys-panel";
import { ServerSettings } from "@/components/dashboard/server-settings";
import { McpEndpointBadge } from "@/components/dashboard/mcp-endpoint-badge";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ServerDetailPage({ params }: Props) {
  const { id } = await params;
  const { db, orgId } = await getDashboardContext();

  const server = await db.mcpServer.findFirst({
    where: { id, organizationId: orgId },
    include: {
      openApiDoc: { select: { title: true, version: true } },
      tools: { orderBy: { name: "asc" } },
      apiKeys: {
        select: {
          id: true,
          name: true,
          type: true,
          paramName: true,
          schemeKey: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      accessTokens: {
        select: {
          id: true,
          name: true,
          prefix: true,
          lastUsedAt: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { logs: true } },
    },
  });
  if (!server) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/servers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to servers
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{server.name}</h1>
            <VisibilityBadge visibility={server.visibility} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            /{server.slug} · {server.openApiDoc?.title} v{server.openApiDoc?.version} ·{" "}
            {server.tools.length} tools
          </p>
          {server.description ? (
            <p className="mt-3 max-w-3xl text-sm">{server.description}</p>
          ) : null}
        </div>
        <McpEndpointBadge slug={server.slug} />
      </div>

      <Tabs defaultValue="tools">
        <TabsList>
          <TabsTrigger value="tools">Tools ({server.tools.length})</TabsTrigger>
          <TabsTrigger value="tokens">
            Access tokens ({server.accessTokens.length})
          </TabsTrigger>
          <TabsTrigger value="keys">Upstream keys ({server.apiKeys.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="tools">
          <Card>
            <CardHeader>
              <CardTitle>Tools</CardTitle>
              <CardDescription>
                Disabled tools are hidden from <code>tools/list</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ToolsList
                serverId={server.id}
                tools={server.tools.map((t) => ({
                  id: t.id,
                  name: t.name,
                  method: t.method,
                  path: t.path,
                  description: t.description,
                  summary: t.summary,
                  enabled: t.enabled,
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tokens">
          <AccessTokensPanel
            serverId={server.id}
            tokens={server.accessTokens.map((t) => ({
              ...t,
              expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
              revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
              createdAt: t.createdAt.toISOString(),
              lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
            }))}
          />
        </TabsContent>

        <TabsContent value="keys">
          <ApiKeysPanel
            serverId={server.id}
            keys={server.apiKeys.map((k) => ({
              ...k,
              createdAt: k.createdAt.toISOString(),
            }))}
          />
        </TabsContent>

        <TabsContent value="settings">
          <ServerSettings
            serverId={server.id}
            initial={{
              name: server.name,
              slug: server.slug,
              description: server.description,
              baseUrl: server.baseUrl,
              visibility: server.visibility,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  if (visibility === "PUBLIC")
    return (
      <Badge variant="success" className="gap-1">
        <Globe className="h-3 w-3" /> Public
      </Badge>
    );
  if (visibility === "UNLISTED")
    return (
      <Badge variant="secondary" className="gap-1">
        <Eye className="h-3 w-3" /> Unlisted
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1">
      <Lock className="h-3 w-3" /> Private
    </Badge>
  );
}
