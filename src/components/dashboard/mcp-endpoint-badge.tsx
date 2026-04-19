"use client";

import { useState } from "react";
import { CopyIcon, CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { mcpUrlFor } from "@/lib/utils";

export function McpEndpointBadge({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = mcpUrlFor(slug);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Endpoint copied.");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 font-mono text-xs">
      <span className="max-w-[320px] truncate px-2">{url}</span>
      <Button size="icon" variant="ghost" onClick={copy} aria-label="CopyIcon endpoint">
        {copied ? (
          <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
        ) : (
          <CopyIcon className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
