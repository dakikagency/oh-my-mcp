import Link from "next/link";
import {
  ArrowRightIcon,
  LightningIcon,
  ShieldCheckIcon,
  StackIcon,
  SparkleIcon,
  FileCodeIcon,
  PlugsIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: FileCodeIcon,
    title: "Any OpenAPI, instantly",
    body: "Paste a URL or a raw 3.0 / 3.1 doc and we'll turn every operation into an MCP tool with typed JSON Schema.",
  },
  {
    icon: PlugsIcon,
    title: "Streamable HTTP transport",
    body: "Speaks the current MCP spec (2025-03-26). Works out of the box with Claude Desktop, Cursor, and any compliant client.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Public by default, private on demand",
    body: "New servers ship open so your agent just works. Flip a switch to require bearer tokens when you're ready.",
  },
  {
    icon: LightningIcon,
    title: "One Worker, global edge",
    body: "All tenants served from a single Cloudflare Worker. Cold-start-free, <50ms median tool discovery.",
  },
  {
    icon: StackIcon,
    title: "Multi-tenant orgs",
    body: "Teams, member invites, roles. Every MCP server is scoped to an organization and auditable.",
  },
  {
    icon: SparkleIcon,
    title: "Agent-ready",
    body: "Discoverable `tools/list`, streaming `tools/call`, JSON-RPC batching. Built to feed LLM agents, not just humans.",
  },
];

const steps = [
  "Paste an OpenAPI URL or document.",
  "Hand the generated MCP endpoint to your agent — done.",
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,theme(colors.primary/15),transparent_60%)]" />
        <div className="container mx-auto flex flex-col items-center gap-8 px-4 py-24 text-center">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            <SparkleIcon weight="fill" className="mr-1 h-3 w-3" />
            The OpenAPI → MCP gateway
          </Badge>
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Turn any OpenAPI document into an{" "}
            <span className="bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
              MCP server
            </span>{" "}
            in one paste.
          </h1>
          <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
            Paste an OpenAPI URL or document. Get a hosted MCP endpoint your
            agent can call immediately — no MCP code, no configuration, no tokens
            required.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Start free <ArrowRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#how">See how it works</Link>
            </Button>
          </div>
          <div className="mt-6 flex items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircleIcon weight="fill" className="h-4 w-4 text-emerald-500" />
              No credit card
            </span>
            <span className="flex items-center gap-1">
              <CheckCircleIcon weight="fill" className="h-4 w-4 text-emerald-500" />
              OpenAPI 3.0 & 3.1
            </span>
            <span className="flex items-center gap-1">
              <CheckCircleIcon weight="fill" className="h-4 w-4 text-emerald-500" />
              MCP 2025-03-26
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything you need to ship an MCP gateway
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built on Next.js, Hono, Prisma and Neon. Deployed as a single Cloudflare Worker.
            </p>
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="border-border/60">
                <CardContent className="pt-6">
                  <f.icon weight="duotone" className="mb-4 h-8 w-8 text-primary" />
                  <CardTitle className="mb-1 text-base">{f.title}</CardTitle>
                  <CardDescription>{f.body}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Spec to agent in two steps
            </h2>
          </div>
          <ol className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            {steps.map((step, i) => (
              <li key={step} className="rounded-xl border bg-card p-6">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary font-mono text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </div>
                <p className="text-sm text-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section id="pricing" className="py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Ready to give your agents the internet?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Free tier for hobby projects. No vendor lock-in — self-host the worker any time.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Create your first MCP server <ArrowRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
