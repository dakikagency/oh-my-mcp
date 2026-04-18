# oh-my-mcp

Turn any OpenAPI document into a hosted **Model Context Protocol** server. One Next.js project, one Cloudflare Worker, one Postgres.

## Stack

- **Next.js 15** (App Router) deployed via **`@opennextjs/cloudflare`** to a single Cloudflare Worker.
- **Hono** backend mounted at `app/api/[[...route]]/route.ts` with a typed RPC client (`hono/client`).
- **Prisma** + **Neon** (Postgres) using the `@prisma/adapter-neon` driver adapter for serverless connections.
- **better-auth** with the `organization` plugin for multi-tenant auth, email/password, GitHub, Google.
- **Tailwind v4** + **shadcn/ui** (handwritten primitives) + **Phosphor Icons**.
- **Zod** schemas shared between client and server.
- MCP **Streamable HTTP** transport at `app/mcp/[slug]/route.ts`.

## Quick start

```bash
pnpm install
cp .env.example .env
# fill in DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET, ENCRYPTION_KEY
pnpm db:generate
pnpm db:migrate -- --name init
pnpm dev
```

App at <http://localhost:3000>. Sign up, create an org, upload an OpenAPI spec, copy the MCP endpoint, paste into your AI client.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server (Node runtime). |
| `pnpm preview` | Build + run locally in `workerd` via OpenNext. |
| `pnpm deploy` | Build + deploy to Cloudflare Workers. |
| `pnpm cf-typegen` | Regenerate `cloudflare-env.d.ts` from bindings. |
| `pnpm db:migrate` | `prisma migrate dev` against your Neon branch. |
| `pnpm db:migrate:deploy` | Apply pending migrations in CI. |
| `pnpm db:studio` | Open Prisma Studio. |

## Environment

| Name | Notes |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string. Used at runtime. |
| `DIRECT_URL` | Non-pooled connection for Prisma migrate. |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | e.g. `http://localhost:3000` or your prod URL. |
| `ENCRYPTION_KEY` | 32-byte base64 key used for AES-GCM on upstream API keys. |
| `NEXT_PUBLIC_APP_URL` | Origin shown in UI copy-paste blocks. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional OAuth. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional OAuth. |

For Cloudflare deploys, set secrets with:

```bash
pnpm wrangler secret put DATABASE_URL
pnpm wrangler secret put BETTER_AUTH_SECRET
pnpm wrangler secret put ENCRYPTION_KEY
# …etc.
```

## Project layout

```
app/
  (marketing)/           # Landing page
  (auth)/                # sign-in, sign-up
  (dashboard)/           # Auth-gated app shell
  api/[[...route]]/      # Hono mount — catch-all HTTP backend
  mcp/[slug]/            # Public MCP Streamable HTTP endpoint
prisma/schema.prisma     # DB schema (better-auth core + orgs + MCP domain)
src/
  server/
    hono.ts              # Root Hono app (chained for RPC types)
    auth.ts              # better-auth factory
    context.ts           # Hono `Env` types
    guards.ts            # requireAuth / requireOrg middleware
    session.ts           # RSC-side session helpers
    mcp/
      fromOpenAPI.ts     # OpenAPI → tool compiler
      parseOpenApi.ts    # In-memory JSON parser + $ref resolver
      executor.ts        # Outbound HTTP executor w/ auth injection
      handler.ts         # Streamable HTTP MCP dispatcher
    routers/             # Hono routers per resource
  lib/
    db.ts                # Prisma client w/ Neon adapter
    auth-client.ts       # better-auth React client
    rpc.ts               # Typed Hono client
    schemas/             # Shared Zod schemas
    crypto.ts            # AES-GCM + SHA-256 helpers
    utils.ts             # cn, slugify
  components/
    ui/                  # shadcn primitives
    dashboard/
    auth/
    theme-provider.tsx
wrangler.jsonc
open-next.config.ts
```

## How the MCP runtime works

1. An MCP client hits `POST /mcp/<slug>` with a JSON-RPC body.
2. The handler loads the `McpServer` by slug + its enabled tools + API keys.
3. Access control: PUBLIC is open; PRIVATE/UNLISTED require a `Bearer <token>` matching an `McpAccessToken` hash.
4. On `tools/list` we return enabled tool names + their JSON Schemas.
5. On `tools/call` we look up the tool, run `executor.executeTool()` which:
   - Fills path params, query string, headers from the JSON args.
   - Decrypts the matching `McpApiKey` with `ENCRYPTION_KEY` and injects it per the OpenAPI security scheme.
   - Fetches upstream with a 30s timeout and truncation at 1 MB.
6. Response is returned as JSON-RPC; we log status + latency to `McpCallLog`.

## Known limitations

- OpenAPI ingest currently accepts **JSON only**. YAML support is on the roadmap.
- Only the `Streamable HTTP` MCP transport is implemented. The legacy SSE transport is intentionally skipped.
- Rate limiting is best-effort; wire up KV/D1 for production.
- Email delivery for invites/verification is not implemented — hook up Resend or similar in `src/server/auth.ts`.

## License

Proprietary to Dakik Agency for now. Open-sourcing is on the table.
