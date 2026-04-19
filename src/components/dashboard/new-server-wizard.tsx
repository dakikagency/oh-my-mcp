"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, LinkSimpleIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, apiMutate } from "@/lib/api";
import { looksLikeUrl } from "@/lib/utils";

/**
 * Single-input "smart" create form. Accepts either an OpenAPI URL or a
 * pasted JSON/YAML document and hands both to the `/servers/quick-create`
 * endpoint, which auto-derives name, slug, and baseUrl from the spec.
 */
export function NewServerWizard() {
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const create = (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = input.trim();
    if (!value) return;
    startTransition(async () => {
      const data = await apiMutate<{
        server: { id: string; slug: string; name: string };
        toolCount: number;
      }>(
        () =>
          api.servers["quick-create"].$post({ json: { input: value } }),
        {
          error: "Could not create server.",
          success: "MCP server is ready.",
        }
      );
      if (data) {
        router.push(`/servers/${data.server.id}`);
        router.refresh();
      }
    });
  };

  const isUrl = looksLikeUrl(input.trim());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paste an OpenAPI document</CardTitle>
        <CardDescription>
          URL or raw JSON / YAML — we handle the rest. Name, slug, and base
          URL are derived from the spec.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={create} className="space-y-4">
          <Textarea
            autoFocus
            rows={8}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              "https://petstore3.swagger.io/api/v3/openapi.json\n\n— or —\n\n{\n  \"openapi\": \"3.1.0\",\n  \"info\": { ... },\n  \"paths\": { ... }\n}"
            }
            className="min-h-[220px] font-mono text-xs"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {isUrl ? (
                <>
                  <LinkSimpleIcon className="h-3 w-3" /> Detected URL — we&apos;ll fetch it.
                </>
              ) : input.trim() ? (
                <>Detected raw document — parsing as JSON or YAML.</>
              ) : (
                <>Tip: press ⌘/Ctrl+Enter to create.</>
              )}
            </span>
            <Button type="submit" disabled={pending || !input.trim()}>
              {pending ? "Creating…" : "Create MCP server"}
              <ArrowRightIcon className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
