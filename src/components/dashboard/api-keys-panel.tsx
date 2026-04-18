"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash } from "@phosphor-icons/react/dist/ssr";

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

type AuthType = "NONE" | "BEARER" | "HEADER" | "QUERY" | "BASIC";

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
}: {
  serverId: string;
  keys: KeyRow[];
}) {
  const [keys, setKeys] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

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
    start(async () => {
      const res = await fetch(`/api/servers/${serverId}/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          paramName: form.paramName || null,
          schemeKey: form.schemeKey || null,
          secret: form.secret,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Could not save key.");
        return;
      }
      const { key } = (await res.json()) as { key: KeyRow };
      setKeys((k) => [key, ...k]);
      setOpen(false);
      setForm({ name: "", type: "BEARER", paramName: "", schemeKey: "", secret: "" });
      toast.success("Key stored (encrypted).");
    });
  };

  const remove = (id: string) => {
    start(async () => {
      const res = await fetch(`/api/servers/${serverId}/api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Could not delete key.");
        return;
      }
      setKeys((k) => k.filter((x) => x.id !== id));
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Upstream credentials</CardTitle>
          <CardDescription>
            Encrypted with AES-256-GCM. Injected into outbound requests at execution time.
          </CardDescription>
        </div>
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus className="h-4 w-4" /> Add key
        </Button>
      </CardHeader>
      <CardContent>
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
                  <Trash className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
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
                <Label htmlFor="k-param">Parameter name</Label>
                <Input
                  id="k-param"
                  value={form.paramName}
                  onChange={(e) => setForm({ ...form, paramName: e.target.value })}
                  placeholder="X-API-Key"
                />
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
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={create}
              disabled={pending || !form.name || !form.secret}
            >
              Save (encrypted)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
