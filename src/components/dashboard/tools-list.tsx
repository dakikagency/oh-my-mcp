"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface Tool {
  id: string;
  name: string;
  method: string;
  path: string;
  summary: string | null;
  description: string | null;
  enabled: boolean;
}

export function ToolsList({
  serverId,
  tools: initialTools,
}: {
  serverId: string;
  tools: Tool[];
}) {
  const [tools, setTools] = useState(initialTools);
  const [, start] = useTransition();

  const toggle = (toolId: string, enabled: boolean) => {
    const previous = tools;
    setTools((t) => t.map((x) => (x.id === toolId ? { ...x, enabled } : x)));
    start(async () => {
      const res = await fetch(`/api/servers/${serverId}/tools/${toolId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
        credentials: "include",
      });
      if (!res.ok) {
        setTools(previous);
        toast.error("Could not update tool.");
      }
    });
  };

  if (tools.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No tools — re-import the OpenAPI document.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {tools.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                {t.method}
              </Badge>
              <span className="truncate font-mono text-sm">{t.name}</span>
            </div>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {t.path}
            </p>
            {(t.summary || t.description) && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {t.summary ?? t.description}
              </p>
            )}
          </div>
          <Switch
            checked={t.enabled}
            onCheckedChange={(v) => toggle(t.id, v)}
            aria-label={`Enable ${t.name}`}
          />
        </li>
      ))}
    </ul>
  );
}
