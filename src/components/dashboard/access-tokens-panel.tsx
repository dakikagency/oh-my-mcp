"use client";

import { useState, useTransition } from "react";
import { CopyIcon, PlusIcon, TrashIcon, CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { apiAction, apiMutate, serverRpc } from "@/lib/api";

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export function AccessTokensPanel({
  serverId,
  tokens: initial,
}: {
  serverId: string;
  tokens: TokenRow[];
}) {
  const [tokens, setTokens] = useState(initial);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<{ token: string; name: string } | null>(null);

  const create = () => {
    startTransition(async () => {
      const data = await apiMutate<{
        accessToken: TokenRow & { expiresAt: string | null };
        raw: string;
      }>(
        () =>
          serverRpc["access-tokens"].$post({
            param: { serverId },
            json: { name },
          }),
        { error: "Could not create token." }
      );
      if (data) {
        setTokens((t) => [
          { ...data.accessToken, lastUsedAt: null, revokedAt: null },
          ...t,
        ]);
        setRevealed({ token: data.raw, name });
        setCreateOpen(false);
        setName("");
      }
    });
  };

  const revoke = (tokenId: string) => {
    startTransition(async () => {
      const ok = await apiAction(
        () =>
          serverRpc["access-tokens"][":tokenId"].revoke.$post({
            param: { serverId, tokenId },
          }),
        { error: "Could not revoke token.", success: "Token revoked." }
      );
      if (ok) {
        setTokens((t) =>
          t.map((x) =>
            x.id === tokenId ? { ...x, revokedAt: new Date().toISOString() } : x
          )
        );
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Access tokens</CardTitle>
          <CardDescription>
            Bearer tokens MCP clients present when calling this server.
          </CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <PlusIcon className="h-4 w-4" /> New token
        </Button>
      </CardHeader>
      <CardContent>
        {tokens.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No tokens yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    {t.revokedAt ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : t.expiresAt && new Date(t.expiresAt) < new Date() ? (
                      <Badge variant="warning">Expired</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {t.prefix}…
                    {t.lastUsedAt ? ` · last used ${new Date(t.lastUsedAt).toLocaleString()}` : ""}
                  </p>
                </div>
                {!t.revokedAt && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => revoke(t.id)}
                    disabled={pending}
                    aria-label="Revoke"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New access token</DialogTitle>
            <DialogDescription>
              You&apos;ll only see the raw value once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="token-name">Name</Label>
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude Desktop on laptop"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={!name || pending}>
              Create token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!revealed}
        onOpenChange={(o) => !o && setRevealed(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token created</DialogTitle>
            <DialogDescription>
              Copy this now — it will never be shown again.
            </DialogDescription>
          </DialogHeader>
          {revealed ? <RevealBox value={revealed.token} /> : null}
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RevealBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-xs">
      <span className="min-w-0 flex-1 break-all">{value}</span>
      <Button size="icon" variant="ghost" onClick={copy} aria-label="Copy token">
        {copied ? (
          <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
        ) : (
          <CopyIcon className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
