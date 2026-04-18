"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Visibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

export function ServerSettings({
  serverId,
  initial,
}: {
  serverId: string;
  initial: {
    name: string;
    slug: string;
    description: string | null;
    baseUrl: string;
    visibility: Visibility;
  };
}) {
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = () => {
    start(async () => {
      const res = await fetch(`/api/servers/${serverId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          description: form.description,
          baseUrl: form.baseUrl,
          visibility: form.visibility,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(data?.message ?? "Could not save.");
        return;
      }
      toast.success("Settings saved.");
      router.refresh();
    });
  };

  const destroy = () => {
    if (!confirm("Delete this server? This cannot be undone.")) return;
    start(async () => {
      const res = await fetch(`/api/servers/${serverId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Could not delete.");
        return;
      }
      toast.success("Server deleted.");
      router.push("/servers");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Control how your server is identified.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-slug">Slug</Label>
            <Input
              id="s-slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea
              id="s-desc"
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value || null })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-base">Base URL</Label>
            <Input
              id="s-base"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["PRIVATE", "UNLISTED", "PUBLIC"] as const).map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setForm({ ...form, visibility: v })}
                  className={
                    "rounded-md border px-3 py-2 text-sm transition-colors " +
                    (form.visibility === v
                      ? "border-primary bg-primary/10"
                      : "hover:bg-accent")
                  }
                >
                  {v.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Deletes this server, its tools, credentials, and access tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            This cannot be undone.
          </p>
          <Button variant="destructive" onClick={destroy} disabled={pending}>
            <Trash className="h-4 w-4" /> Delete server
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
