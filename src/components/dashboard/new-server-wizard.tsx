"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle,
  CloudArrowUp,
  FileText,
  LinkSimple,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { slugify } from "@/lib/utils";

type IngestResult = {
  id: string;
  title: string;
  version: string;
  toolCount: number;
  baseUrl: string | null;
};

export function NewServerWizard() {
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, start] = useTransition();
  const [doc, setDoc] = useState<IngestResult | null>(null);

  // Step 1 inputs
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Step 2 inputs
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "UNLISTED" | "PUBLIC">(
    "PRIVATE"
  );

  const router = useRouter();

  const ingestUrl = () => {
    if (!url) return;
    start(async () => {
      const res = await fetch("/api/openapi/from-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
        credentials: "include",
      });
      await handleIngest(res);
    });
  };

  const ingestText = () => {
    if (!text) return;
    start(async () => {
      const res = await fetch("/api/openapi/from-text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text, source: "PASTE" }),
        credentials: "include",
      });
      await handleIngest(res);
    });
  };

  const ingestFile = () => {
    if (!file) return;
    start(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/openapi/from-file", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      await handleIngest(res);
    });
  };

  const handleIngest = async (res: Response) => {
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      toast.error(data?.message ?? "Failed to import OpenAPI document.");
      return;
    }
    const { doc: d } = (await res.json()) as { doc: IngestResult };
    setDoc(d);
    setName(d.title);
    setSlug(slugify(d.title));
    setBaseUrl(d.baseUrl ?? "");
    setStep(2);
  };

  const create = () => {
    if (!doc) return;
    start(async () => {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          description: description || null,
          baseUrl: baseUrl || null,
          visibility,
          openApiDocId: doc.id,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(data?.message ?? "Could not create server.");
        return;
      }
      const { server } = (await res.json()) as { server: { id: string } };
      toast.success("Server created.");
      router.push(`/servers/${server.id}`);
      router.refresh();
    });
  };

  if (step === 2 && doc) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configure server</CardTitle>
          <CardDescription>
            {doc.toolCount} tools discovered in {doc.title} v{doc.version}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your MCP endpoint will be{" "}
              <span className="font-mono">
                {typeof window !== "undefined" ? window.location.origin : ""}
                /mcp/{slug || "…"}
              </span>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown to agents as the server’s purpose."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
            />
            <p className="text-xs text-muted-foreground">
              Defaults to the first <code>servers[]</code> entry in your spec.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["PRIVATE", "UNLISTED", "PUBLIC"] as const).map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={
                    "rounded-md border px-3 py-2 text-sm transition-colors " +
                    (visibility === v
                      ? "border-primary bg-primary/10"
                      : "hover:bg-accent")
                  }
                >
                  {v.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={create} disabled={pending || !name || !slug}>
              {pending ? "Creating…" : "Create server"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import OpenAPI</CardTitle>
        <CardDescription>
          Supply a URL, paste JSON, or upload a file. JSON only for now — YAML coming soon.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="url">
          <TabsList>
            <TabsTrigger value="url">
              <LinkSimple className="h-4 w-4" /> URL
            </TabsTrigger>
            <TabsTrigger value="paste">
              <FileText className="h-4 w-4" /> Paste
            </TabsTrigger>
            <TabsTrigger value="upload">
              <CloudArrowUp className="h-4 w-4" /> Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="space-y-3 pt-4">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
            />
            <Button onClick={ingestUrl} disabled={pending || !url}>
              {pending ? "Fetching…" : "Import"}
            </Button>
          </TabsContent>

          <TabsContent value="paste" className="space-y-3 pt-4">
            <Textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='{"openapi":"3.1.0",...}'
              className="font-mono text-xs"
            />
            <Button onClick={ingestText} disabled={pending || !text}>
              {pending ? "Parsing…" : "Import"}
            </Button>
          </TabsContent>

          <TabsContent value="upload" className="space-y-3 pt-4">
            <Input
              type="file"
              accept="application/json,.json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            ) : null}
            <Button onClick={ingestFile} disabled={pending || !file}>
              {pending ? "Uploading…" : "Import"}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
