import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { getDashboardContext } from "@/server/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToolsList } from "@/components/dashboard/tools-list";
import { AccessTokensPanel } from "@/components/dashboard/access-tokens-panel";
import { ApiKeysPanel } from "@/components/dashboard/api-keys-panel";
import { ServerActionsMenu } from "@/components/dashboard/server-actions-menu";
import { McpEndpointBadge } from "@/components/dashboard/mcp-endpoint-badge";
import { VisibilityBadge } from "@/components/dashboard/visibility-badge";

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
      tools: {
        select: {
          id: true,
          name: true,
          method: true,
          path: true,
          description: true,
          summary: true,
          enabled: true,
          securityKeys: true,
        },
        orderBy: { name: "asc" },
      },
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
    },
  });
  if (!server) notFound();

  // Union of every security scheme referenced by any enabled tool. When
  // non-empty, the upstream-credentials section surfaces a banner prompting
  // the user to configure matching keys. When empty AND no keys exist yet,
  // the section is hidden entirely so the common token-less case stays
  // clutter-free.
  const requiredSchemes = Array.from(
    new Set(
      server.tools
        .filter((t) => t.enabled)
        .flatMap((t) => t.securityKeys ?? [])
        .filter(Boolean)
    )
  );
  const configuredSchemes = new Set(
    server.apiKeys.map((k) => k.schemeKey).filter(Boolean) as string[]
  );
  const missingSchemes = requiredSchemes.filter((s) => !configuredSchemes.has(s));
  const showUpstreamSection = requiredSchemes.length > 0 || server.apiKeys.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/servers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="h-3 w-3" /> Back to servers
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold">{server.name}</h1>
            <VisibilityBadge visibility={server.visibility} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {server.openApiDoc?.title} v{server.openApiDoc?.version} ·{" "}
            {server.tools.length} tools
          </p>
          {server.description ? (
            <p className="mt-3 max-w-3xl text-sm">{server.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <McpEndpointBadge slug={server.slug} />
          <ServerActionsMenu
            serverId={server.id}
            initialName={server.name}
            initialSlug={server.slug}
            initialBaseUrl={server.baseUrl}
            visibility={server.visibility}
          />
        </div>
      </div>

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

      {showUpstreamSection && (
        <ApiKeysPanel
          serverId={server.id}
          keys={server.apiKeys.map((k) => ({
            ...k,
            createdAt: k.createdAt.toISOString(),
          }))}
          requiredSchemes={requiredSchemes}
          missingSchemes={missingSchemes}
        />
      )}

      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium">
          <span>
            Lock down access
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {server.visibility === "PUBLIC"
                ? "Currently public — anyone with the URL can call it."
                : `${server.accessTokens.filter((t) => !t.revokedAt).length} active tokens`}
            </span>
          </span>
          <span className="text-xs text-muted-foreground group-open:hidden">
            Show
          </span>
          <span className="hidden text-xs text-muted-foreground group-open:inline">
            Hide
          </span>
        </summary>
        <div className="border-t p-5">
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
        </div>
      </details>
    </div>
  );
}

