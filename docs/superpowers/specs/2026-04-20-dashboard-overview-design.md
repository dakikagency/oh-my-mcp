# Dashboard Overview redesign

**Status:** design
**Date:** 2026-04-20
**Surface:** `app/(dashboard)/dashboard/page.tsx`

## Problem

The current `/dashboard` Overview page is generic: four static count cards and a "Recent servers" list that duplicates `/servers`. It tells the user nothing about *how their MCP gateway is actually being used*. We want a clutter-free, modern Overview that makes live usage the primary signal.

## Goals

- Make the Overview feel operational: "what's getting called, right now".
- Keep it readable at a glance — one header row, one KPI row, one chart row.
- Reuse the existing `McpCallLog` table; no new schema.
- Integrate Chart.js (user's preferred chart library) in a tree-shaken, theme-aware way.

## Non-goals

- Per-server or per-tool deep analytics (that belongs on server/tool detail pages).
- Historical comparison, forecasting, alerting.
- A "getting started" onboarding card — `/servers/new` owns that flow.
- Replacing the server list surface (stays at `/servers`).

## Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Overview                                          [24h 7d 30d]  [+] │
│  acme — your MCP gateway at a glance                                 │
├──────────────────────────────────────────────────────────────────────┤
│  ╭─ Servers ─╮  ╭─ Tools ───╮  ╭─ Calls 7d ╮  ╭─ Error rate ─╮       │
│  │    12     │  │    284    │  │   18.3k   │  │    0.42%     │       │
│  ╰───────────╯  ╰───────────╯  ╰───────────╯  ╰──────────────╯       │
├──────────────────────────────────────────────────────────────────────┤
│  ╭─ Top tools by calls ─────╮  ╭─ Top servers by calls ───────╮      │
│  │  createOrder   ▓▓▓▓▓▓▓  │  │  orders-api  ▓▓▓▓▓▓▓▓▓▓▓▓▓   │      │
│  │  listCustomers ▓▓▓▓▓    │  │  stripe-api  ▓▓▓▓▓▓          │      │
│  │  …top 10                │  │  …top 10                     │      │
│  ╰─────────────────────────╯  ╰──────────────────────────────╯      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Header row:** page title + one-line org subtitle on the left; time-range toggle + `New server` button on the right. Same spacing idiom as existing server-detail pages.
- **KPI row:** four cards, equal width on desktop, 2×2 on mobile. Label top, large tabular-nums value, optional muted sublabel.
- **Charts row:** two equal-width cards on desktop; stacked on mobile (`md:grid-cols-2`).

## KPIs (selected: "inventory + pulse")

1. **Servers** — `mcpServer.count` for the org (all-time, static).
2. **Tools** — `mcpTool.count` for the org's servers (all-time, static).
3. **Calls (window)** — total `mcpCallLog` rows in the selected window, formatted with `k`/`M` suffix above 1000.
4. **Error rate (window)** — `count(status >= 400) / count(*)` as a percentage, two decimals, `—` when total is 0.

Two of the four respect the time toggle; static ones show no sublabel, windowed ones show the window in the label (`Calls 7d`).

## Charts

Two horizontal bar charts, each top-10.

- **Top tools by calls** — bars labelled by `toolName`. When two servers share a tool name, counts are summed (intentional: a tool identity at gateway level).
- **Top servers by calls** — bars labelled by server `name` (fall back to `slug`). Deleted servers that still have log rows show as `(deleted)`.

### Chart.js integration

- Add `chart.js` and `react-chartjs-2` dependencies.
- Tree-shaken registration in the chart component module (top-level side effect, runs once):
  `BarController, BarElement, CategoryScale, LinearScale, Tooltip`.
- Horizontal orientation via `indexAxis: 'y'`.
- Colors resolved from CSS vars (`--color-foreground`, `--color-muted`, `--color-border`) via `getComputedStyle(document.documentElement).getPropertyValue(...)` at render time. The chart re-reads on mount and whenever the `resolvedTheme` from `next-themes` changes (effect re-runs `chart.update()`), so light/dark toggles repaint without a reload.
- No legend (single series).
- Tooltip shows `{label}: {value.toLocaleString()} calls`.

## Time range toggle

- URL-driven: `?range=24h|7d|30d`, default `7d`.
- Segmented pill control, same visual language as `src/components/dashboard/top-nav.tsx` (rounded-full, animated indicator).
- Client component uses `useSearchParams` + `useRouter().replace(..., { scroll: false })`. Changing the range triggers an RSC re-render because the page reads `searchParams`.
- Unknown/missing values fall back to `7d` silently (no redirect).

## Data layer

New server-only module: `src/server/dashboard/overview.ts`.

```ts
export type Range = "24h" | "7d" | "30d";

export type OverviewMetrics = {
  range: Range;
  windowStart: Date;
  counts: { servers: number; tools: number };
  kpis: { calls: number; errorRate: number | null };
  topTools: { name: string; calls: number }[];      // ≤10, desc
  topServers: { id: string; name: string; calls: number }[]; // ≤10, desc
};

export async function getOverviewMetrics(
  orgId: string,
  range: Range,
): Promise<OverviewMetrics>;
```

Implementation runs six queries with `Promise.all`:

1. `mcpServer.count({ where: { organizationId } })`
2. `mcpTool.count({ where: { server: { organizationId } } })`
3. Total window calls: `mcpCallLog.count({ where: { server: { organizationId }, createdAt: { gte: windowStart } } })`
4. Error window calls: same `where` with `status: { gte: 400 }` — a second scalar `count`. (Prisma's `aggregate` can't apply different filters to sub-aggregates in a single call, so two counts is simpler than a raw query.)
5. `mcpCallLog.groupBy({ by: ['toolName'], _count: { _all: true }, orderBy: { _count: { toolName: 'desc' } }, take: 10, where: … })`
6. `mcpCallLog.groupBy({ by: ['serverId'], _count: { _all: true }, orderBy: { _count: { serverId: 'desc' } }, take: 10, where: … })`

After (6) returns, a single follow-up `mcpServer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } })` hydrates names; missing ids render as `(deleted)`.

## Components

All under `src/components/dashboard/overview/`.

| File | Kind | Role |
|---|---|---|
| `time-range-toggle.tsx` | client | Segmented control, writes `?range=` |
| `kpi-card.tsx` | server | `{ label, value, sublabel? }` card |
| `usage-bar-chart.tsx` | client | Chart.js `<Bar>` wrapper, registers controllers once at module load |
| `empty-chart.tsx` | server | Placeholder content for zero-data state |
| `chart-card.tsx` | server | Card shell with title + either `<UsageBarChart>` or `<EmptyChart>` |

## Page file

`app/(dashboard)/dashboard/page.tsx` becomes:

1. Read `searchParams.range`, coerce to a valid `Range`.
2. Call `getOverviewMetrics(orgId, range)`.
3. Render header → KPI row → chart row.
4. Stay `export const dynamic = "force-dynamic"`.

The existing `EmptyState` helper and `recentServers` block are deleted — the new empty-chart behaviour replaces them.

## Empty state

- When `topTools` is empty → render `<EmptyChart>` inside the Top-tools card.
- When `topServers` is empty → same, in the Top-servers card.
- KPIs still render: Calls → `0`, Error rate → `—`.
- Header and range toggle stay identical.

`EmptyChart` content: a subtle centered message — "No usage in this window yet." No icon, no CTA (the existing `New server` button in the header covers that).

## Error handling

- Range param not in the allowed set → fall back to `7d`. Never 404 on a malformed query param.
- One of the five queries throws → let the error propagate to the Next.js error boundary (nothing custom — the dashboard layout already sits under Next's default error handling).
- Server names missing after `findMany` hydration → render `(deleted)` and still show the bar.

## Testing

Manual verification in the browser:

- `/dashboard` — default 7d view, charts populated when logs exist.
- `/dashboard?range=24h`, `?range=7d`, `?range=30d` — ranges drive both KPIs and charts.
- `/dashboard?range=garbage` — falls back to 7d without console errors.
- Fresh org with no call logs — empty charts render cleanly; KPIs show `0` / `—`.
- Toggle theme — chart colors track the theme.
- Mobile viewport — KPI row wraps to 2×2, charts stack.

No unit tests for the page; the data layer's pure query shape is covered by TypeScript + Prisma.

## Rollout

Single PR. No feature flag. `McpCallLog` already exists in the schema and `schema.prisma` has the `[serverId, createdAt]` index, so the windowed groupBy queries are cheap.

## Open questions

None at time of writing. If per-tool or per-server drilldowns become a need later, link out from each bar to the respective detail page — not in scope for this PR.
