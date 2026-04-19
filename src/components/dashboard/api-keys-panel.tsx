"use client";

import { useState, useTransition } from "react";
import { PlusIcon, TrashIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";

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
import type { AuthType } from "@/lib/schemas";

interface KeyRow {
  id: string;
  name: string;
  type: AuthType;
  paramName: string | null;
  schemeKey: string | null;
  createdAt: string;
}

export function ApiKeysPanel({
  serverId,
  keys: initial,
  requiredSchemes = [],
  missingSchemes = [],
}: {
  serverId: string;
  keys: KeyRow[];
  /** Security scheme keys referenced by the OpenAPI spec. */
  requiredSchemes?: string[];
  /** Subset of `requiredSchemes` that don't yet have a stored credential. */
  missingSchemes?: string[];
}) {
  const [keys, setKeys] = useState(initial);
  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState<{
    name: string;
    type: AuthType;
    paramName: string;
    schemeKey: string;
    secret: string;
  }>({
    name: "",
    type: "BEARER",
    paramName: "",
    schemeKey: "",
    secret: "",
  });

  const create = () => {
    startTransition(async () => {
      const data = await apiMutate<{ apiKey: KeyRow }>(
        () =>
          serverRpc["api-keys"].$post({
            param: { serverId },
            json: {
              name: form.name,
              type: form.type,
              paramName: form.paramName || null,
              schemeKey: form.schemeKey || null,
              secret: form.secret,
            },
          }),
        { error: "Could not save key.", success: "Key stored (encrypted)." }
      );
      if (data) {
        setKeys((k) => [data.apiKey, ...k]);
        setAddKeyOpen(false);
        setForm({ name: "", type: "BEARER", paramName: "", schemeKey: "", secret: "" });
      }
    });
  };

  const openForScheme = (scheme: string) => {
    setForm({
      name: scheme,
      type: "BEARER",
      paramName: "",
      schemeKey: scheme,
      secret: "",
    });
    setAddKeyOpen(true);
  };

  const remove = (keyId: string) => {
    startTransition(async () => {
      const ok = await apiAction(
        () =>
          serverRpc["api-keys"][":keyId"].$delete({
            param: { serverId, keyId },
          }),
        { error: "Could not delete key." }
      );
      if (ok) setKeys((k) => k.filter((x) => x.id !== keyId));
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Upstream credentials</CardTitle>
          <CardDescription>
            {requiredSchemes.length > 0
              ? "The OpenAPI spec declares security — add a credential for each scheme."
              : "Encrypted with AES-256-GCM. Injected into outbound requests at execution time."}
          </CardDescription>
        </div>
        <Button onClick={() => setAddKeyOpen(true)} size="sm">
          <PlusIcon className="h-4 w-4" /> Add key
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {missingSchemes.length > 0 && (
          <div className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <WarningIcon weight="fill" className="mt-0.5 h-4 w-4 flex-none" />
              <div>
                <p className="font-medium">Missing credentials</p>
                <p className="mt-0.5 text-xs opacity-90">
                  Add keys for:{" "}
                  {missingSchemes.map((s, i) => (
                    <span key={s}>
                      <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono">
                        {s}
                      </code>
                      {i < missingSchemes.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {missingSchemes.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  onClick={() => openForScheme(s)}
                >
                  Add for <code className="ml-1 font-mono text-xs">{s}</code>
                </Button>
              ))}
            </div>
          </div>
        )}
        {keys.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No upstream credentials.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{k.name}</span>
                    <Badge variant="outline">{k.type.toLowerCase()}</Badge>
                    {k.schemeKey ? (
                      <Badge variant="secondary">scheme: {k.schemeKey}</Badge>
                    ) : null}
                  </div>
                  {k.paramName ? (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {k.paramName}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(k.id)}
                  disabled={pending}
                  aria-label="Delete key"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={addKeyOpen} onOpenChange={setAddKeyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add upstream credential</DialogTitle>
            <DialogDescription>
              Bind this to a security scheme in your OpenAPI doc for automatic injection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="k-name">Label</Label>
              <Input
                id="k-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Production API key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k-type">Type</Label>
              <select
                id="k-type"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AuthType })}
              >
                <option value="BEARER">Bearer token</option>
                <option value="HEADER">Header</option>
                <option value="QUERY">Query parameter</option>
                <option value="BASIC">Basic auth (user:pass)</option>
              </select>
            </div>
            {(form.type === "HEADER" || form.type === "QUERY") && (
              <div className="space-y-2">
                <Label htmlFor="k-param">
                  Parameter name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="k-param"
                  value={form.paramName}
                  onChange={(e) => setForm({ ...form, paramName: e.target.value })}
                  placeholder="X-API-Key"
                  required
                  aria-invalid={
                    (form.type === "HEADER" || form.type === "QUERY") &&
                    !form.paramName
                      ? true
                      : undefined
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Required for {form.type.toLowerCase()} credentials —
                  without it the secret will never be injected.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="k-scheme">OpenAPI scheme (optional)</Label>
              <Input
                id="k-scheme"
                value={form.schemeKey}
                onChange={(e) => setForm({ ...form, schemeKey: e.target.value })}
                placeholder="apiKeyAuth"
              />
              <p className="text-xs text-muted-foreground">
                Matches <code>components.securitySchemes.&lt;name&gt;</code>.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="k-secret">Secret</Label>
              <Input
                id="k-secret"
                type="password"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddKeyOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={create}
              disabled={
                pending ||
                !form.name ||
                !form.secret ||
                // HEADER/QUERY secrets without a paramName can never be
                // injected — block the save instead of storing dead data.
                ((form.type === "HEADER" || form.type === "QUERY") &&
                  !form.paramName)
              }
            >
              Save (encrypted)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
