# Dashboard Overview Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic `/dashboard` Overview with a clutter-free, time-windowed operational view: KPI row + two horizontal bar charts (top tools, top servers) backed by `mcp_call_log`, using Chart.js.

**Architecture:** Server-rendered page reads `?range=24h|7d|30d` from `searchParams`, calls a new `getOverviewMetrics(orgId, range)` aggregator, and renders a small tree of focused components. Charts are isolated to a client-only wrapper around `react-chartjs-2` with tree-shaken controllers and theme-var color resolution.

**Tech Stack:** Next.js 15 App Router (RSC), React 19, Prisma 6, Tailwind v4, Chart.js 4 + react-chartjs-2 5, next-themes, Phosphor icons.

**Spec:** `docs/superpowers/specs/2026-04-20-dashboard-overview-design.md`.

**Project conventions (important):**
- No test runner is configured. Verification per task is `pnpm typecheck` + manual browser check when UI is touched. Do not scaffold a test framework.
- Path alias `@/` → `src/`. Files under `app/` are route/layout files only.
- Server components are the default. Client components must start with `"use client"`.
- Theme toggling uses `next-themes` with `attribute="class"` → `.dark` on `<html>`.

---

### Task 1: Install Chart.js dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install runtime deps**

Run:
```bash
pnpm add chart.js@^4.4.0 react-chartjs-2@^5.2.0
```

Expected: `package.json` gains two dependencies; lockfile updates. No other files change.

- [ ] **Step 2: Sanity-check typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors introduced).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add chart.js and react-chartjs-2"
```

---

### Task 2: Range helper utility

**Files:**
- Create: `src/lib/dashboard-range.ts`

- [ ] **Step 1: Write the helper**

```ts
// src/lib/dashboard-range.ts
export const DASHBOARD_RANGES = ["24h", "7d", "30d"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const DEFAULT_RANGE: DashboardRange = "7d";

/** Coerces unknown input (e.g. `searchParams.range`) to a valid range. */
export function coerceRange(input: unknown): DashboardRange {
  return typeof input === "string" && (DASHBOARD_RANGES as readonly string[]).includes(input)
    ? (input as DashboardRange)
    : DEFAULT_RANGE;
}

/** Start of the window for the given range, computed from `now`. */
export function rangeStart(range: DashboardRange, now: Date = new Date()): Date {
  const ms = { "24h": 24 * 60 * 60 * 1000, "7d": 7 * 24 * 60 * 60 * 1000, "30d": 30 * 24 * 60 * 60 * 1000 }[range];
  return new Date(now.getTime() - ms);
}

/** Short human label for the windowed KPI cards, e.g. "Calls 7d". */
export function rangeLabel(range: DashboardRange): string {
  return { "24h": "24h", "7d": "7d", "30d": "30d" }[range];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/dashboard-range.ts
git commit -m "feat(lib): dashboard range helper"
```

---

### Task 3: Overview metrics server function

**Files:**
- Create: `src/server/dashboard/overview.ts`

- [ ] **Step 1: Write the aggregator**

```ts
// src/server/dashboard/overview.ts
import type { PrismaClient } from "@prisma/client";

import { getDb } from "@/lib/db";
import { type DashboardRange, rangeStart } from "@/lib/dashboard-range";

export type TopEntry = { name: string; calls: number };
export type TopServerEntry = TopEntry & { id: string };

export type OverviewMetrics = {
  range: DashboardRange;
  windowStart: Date;
  counts: { servers: number; tools: number };
  kpis: { calls: number; errorRate: number | null };
  topTools: TopEntry[];
  topServers: TopServerEntry[];
};

const TOP_N = 10;

export async function getOverviewMetrics(
  orgId: string,
  range: DashboardRange,
  db: PrismaClient = getDb()
): Promise<OverviewMetrics> {
  const windowStart = rangeStart(range);
  const windowWhere = {
    server: { organizationId: orgId },
    createdAt: { gte: windowStart },
  } as const;

  const [servers, tools, calls, errors, toolGroups, serverGroups] = await Promise.all([
    db.mcpServer.count({ where: { organizationId: orgId } }),
    db.mcpTool.count({ where: { server: { organizationId: orgId } } }),
    db.mcpCallLog.count({ where: windowWhere }),
    db.mcpCallLog.count({ where: { ...windowWhere, status: { gte: 400 } } }),
    db.mcpCallLog.groupBy({
      by: ["toolName"],
      where: windowWhere,
      _count: { _all: true },
      orderBy: { _count: { toolName: "desc" } },
      take: TOP_N,
    }),
    db.mcpCallLog.groupBy({
      by: ["serverId"],
      where: windowWhere,
      _count: { _all: true },
      orderBy: { _count: { serverId: "desc" } },
      take: TOP_N,
    }),
  ]);

  const serverIds = serverGroups.map((g) => g.serverId);
  const serverRows = serverIds.length
    ? await db.mcpServer.findMany({
        where: { id: { in: serverIds } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const serverNameById = new Map(serverRows.map((s) => [s.id, s.name || s.slug]));

  const topTools: TopEntry[] = toolGroups.map((g) => ({
    name: g.toolName,
    calls: g._count._all,
  }));
  const topServers: TopServerEntry[] = serverGroups.map((g) => ({
    id: g.serverId,
    name: serverNameById.get(g.serverId) ?? "(deleted)",
    calls: g._count._all,
  }));

  return {
    range,
    windowStart,
    counts: { servers, tools },
    kpis: {
      calls,
      errorRate: calls === 0 ? null : errors / calls,
    },
    topTools,
    topServers,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. If the Prisma groupBy `orderBy` shape complains, the fix is to cast the `orderBy` using `Prisma.McpCallLogOrderByWithAggregationInput` — import `Prisma` from `@prisma/client` and annotate the `orderBy` literal.

- [ ] **Step 3: Commit**

```bash
git add src/server/dashboard/overview.ts
git commit -m "feat(server): overview metrics aggregator"
```

---

### Task 4: TimeRangeToggle client component

**Files:**
- Create: `src/components/dashboard/overview/time-range-toggle.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/dashboard/overview/time-range-toggle.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";
import { DASHBOARD_RANGES, type DashboardRange } from "@/lib/dashboard-range";

export function TimeRangeToggle({ value }: { value: DashboardRange }) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const select = (next: DashboardRange) => {
    if (next === value) return;
    const qs = new URLSearchParams(params?.toString());
    qs.set("range", next);
    startTransition(() => {
      router.replace(`?${qs.toString()}`, { scroll: false });
    });
  };

  return (
    <div
      role="tablist"
      aria-label="Time range"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-card/50 p-1 text-sm font-medium",
        isPending && "opacity-70"
      )}
    >
      {DASHBOARD_RANGES.map((r) => {
        const active = r === value;
        return (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => select(r)}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/overview/time-range-toggle.tsx
git commit -m "feat(dashboard): time range toggle"
```

---

### Task 5: KpiCard component

**Files:**
- Create: `src/components/dashboard/overview/kpi-card.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/dashboard/overview/kpi-card.tsx
import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        {sublabel ? (
          <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Format large counts as "18.3k" / "1.2M" for readable KPI values. */
export function formatCount(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
}

/** Format fractional error rate as "0.42%" or "—" when input is null. */
export function formatErrorRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(2)}%`;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/overview/kpi-card.tsx
git commit -m "feat(dashboard): kpi card component"
```

---

### Task 6: UsageBarChart client component

**Files:**
- Create: `src/components/dashboard/overview/usage-bar-chart.tsx`

- [ ] **Step 1: Write the chart wrapper**

```tsx
// src/components/dashboard/overview/usage-bar-chart.tsx
"use client";

import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar } from "react-chartjs-2";
import { useTheme } from "next-themes";

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

type Datum = { label: string; value: number };

type Palette = { bar: string; barHover: string; text: string; grid: string };

function readPalette(): Palette {
  if (typeof window === "undefined") {
    return { bar: "#000", barHover: "#000", text: "#000", grid: "#e5e5e5" };
  }
  const cs = getComputedStyle(document.documentElement);
  const fg = cs.getPropertyValue("--color-foreground").trim() || "#000";
  const muted = cs.getPropertyValue("--color-muted-foreground").trim() || "#737373";
  const border = cs.getPropertyValue("--color-border").trim() || "#e5e5e5";
  return { bar: fg, barHover: muted, text: fg, grid: border };
}

export function UsageBarChart({ data, valueLabel = "calls" }: { data: Datum[]; valueLabel?: string }) {
  const { resolvedTheme } = useTheme();
  const [palette, setPalette] = useState<Palette>(() => readPalette());
  const chartRef = useRef<ChartJS<"bar"> | null>(null);

  useEffect(() => {
    setPalette(readPalette());
  }, [resolvedTheme]);

  const chartData = useMemo<ChartData<"bar">>(
    () => ({
      labels: data.map((d) => d.label),
      datasets: [
        {
          data: data.map((d) => d.value),
          backgroundColor: palette.bar,
          hoverBackgroundColor: palette.barHover,
          borderRadius: 6,
          barThickness: 14,
          maxBarThickness: 18,
        },
      ],
    }),
    [data, palette]
  );

  const options = useMemo<ChartOptions<"bar">>(
    () => ({
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.x.toLocaleString()} ${valueLabel}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: palette.grid, drawTicks: false },
          ticks: { color: palette.text, precision: 0 },
          border: { display: false },
        },
        y: {
          grid: { display: false },
          ticks: { color: palette.text, autoSkip: false },
          border: { display: false },
        },
      },
    }),
    [palette, valueLabel]
  );

  return (
    <div className="h-[280px]">
      <Bar ref={chartRef} data={chartData} options={options} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. `react-chartjs-2`'s ref generic needs the `"bar"` literal — if TS complains about the `ref` prop, drop the `chartRef` (it's defensive only; not read anywhere). The color re-paint on theme change works via the `useMemo` recomputing `chartData` / `options` when `palette` state updates.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/overview/usage-bar-chart.tsx
git commit -m "feat(dashboard): chart.js bar chart wrapper"
```

---

### Task 7: EmptyChart + ChartCard composition

**Files:**
- Create: `src/components/dashboard/overview/chart-card.tsx`

- [ ] **Step 1: Write the shell**

```tsx
// src/components/dashboard/overview/chart-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { UsageBarChart } from "./usage-bar-chart";

export function ChartCard({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length === 0 ? <EmptyChart /> : <UsageBarChart data={data} />}
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[280px] items-center justify-center text-center">
      <p className="text-sm text-muted-foreground">No usage in this window yet.</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/overview/chart-card.tsx
git commit -m "feat(dashboard): chart card shell with empty state"
```

---

### Task 8: Rewrite the Overview page

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx` (full replacement)

- [ ] **Step 1: Replace file contents**

```tsx
// app/(dashboard)/dashboard/page.tsx
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/dashboard/overview/chart-card";
import {
  KpiCard,
  formatCount,
  formatErrorRate,
} from "@/components/dashboard/overview/kpi-card";
import { TimeRangeToggle } from "@/components/dashboard/overview/time-range-toggle";
import { coerceRange, rangeLabel } from "@/lib/dashboard-range";
import { getOverviewMetrics } from "@/server/dashboard/overview";
import { getDashboardContext } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { db, orgId } = await getDashboardContext();
  const { range: rawRange } = await searchParams;
  const range = coerceRange(rawRange);
  const metrics = await getOverviewMetrics(orgId, range, db);

  const windowSuffix = rangeLabel(range);
  const toolData = metrics.topTools.map((t) => ({ label: t.name, value: t.calls }));
  const serverData = metrics.topServers.map((s) => ({ label: s.name, value: s.calls }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Your MCP gateway at a glance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TimeRangeToggle value={range} />
          <Button asChild>
            <Link href="/servers/new">
              New server <ArrowRightIcon className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Servers" value={metrics.counts.servers.toLocaleString()} />
        <KpiCard label="Tools" value={metrics.counts.tools.toLocaleString()} />
        <KpiCard
          label={`Calls ${windowSuffix}`}
          value={formatCount(metrics.kpis.calls)}
        />
        <KpiCard
          label={`Error rate ${windowSuffix}`}
          value={formatErrorRate(metrics.kpis.errorRate)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title={`Top tools · ${windowSuffix}`} data={toolData} />
        <ChartCard title={`Top servers · ${windowSuffix}`} data={serverData} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat(dashboard): Overview redesign with usage charts"
```

---

### Task 9: Manual verification

**Files:** no changes; verification only.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Expected: Next.js dev server starts on http://localhost:3000.

- [ ] **Step 2: Verify the golden path**

Open `http://localhost:3000/dashboard` while signed in. Confirm:
- Header shows "Overview" + subtitle, `24h 7d 30d` toggle with `7d` highlighted, and "New server" button on the right.
- Four KPI cards render: Servers, Tools, Calls 7d, Error rate 7d.
- Two chart cards render side-by-side on desktop, stacked on mobile.
- If the org has call logs: bars render with labels.
- If the org has no call logs: "No usage in this window yet." message inside each chart card; KPIs show 0 and `—`.

- [ ] **Step 3: Verify the range toggle**

Click `24h`, `7d`, `30d` in turn. Confirm:
- URL updates to `?range=24h` etc. without a full page reload (no scroll jump).
- KPI labels update to `Calls 24h` / `Calls 30d` and values change.
- Chart titles update.

- [ ] **Step 4: Verify fallback**

Navigate to `http://localhost:3000/dashboard?range=foo`. Confirm:
- Page renders as if `range=7d` (toggle shows `7d` active).
- No console errors.

- [ ] **Step 5: Verify theme**

Toggle light/dark via the UI's theme switch (or browser OS toggle if system). Confirm bar colors and axis text flip to match the theme on the same page (no reload needed).

- [ ] **Step 6: Verify mobile layout**

In devtools, switch to a mobile viewport (~375px). Confirm:
- KPI row becomes 2×2.
- Chart cards stack vertically.
- Range toggle stays tappable.

- [ ] **Step 7: Stop the dev server and run final typecheck**

Kill `pnpm dev`. Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: No additional commit needed**

This task produces no code changes. If any issues were found in Steps 2–6, return to the relevant task, fix, and re-verify.

---

## Post-implementation notes

- The old `EmptyState` local helper and `recentServers` fetch in the previous `page.tsx` are removed by Task 8 — no separate cleanup commit needed.
- Chart.js registration lives at module scope in `usage-bar-chart.tsx`. The module is client-only (`"use client"`) so the side effect runs on the browser, not the server.
- If a future task wants a `calls-over-time` chart, reuse `UsageBarChart` → it can be upgraded to a generic `<ChartFrame type="bar"|"line">` at that point, not now (YAGNI).

## Self-review

**Spec coverage (checked section-by-section):**

- Layout diagram → Task 8 page file.
- KPI row (Servers / Tools / Calls window / Error rate window) → Task 5 + Task 8.
- Two horizontal bar charts with `indexAxis: 'y'` → Task 6 + Task 7.
- Chart.js tree-shaken registration → Task 6.
- Theme-aware colors via CSS vars + `resolvedTheme` effect → Task 6.
- URL-driven time range `?range=` with silent fallback → Task 2 (`coerceRange`) + Task 4 + Task 8.
- Data layer with six parallel queries + follow-up server-name hydration → Task 3.
- Empty chart state ("No usage in this window yet.") → Task 7.
- Error handling: silent fallback for bad range (done); query errors propagate to Next's boundary (implicit — no try/catch needed).
- Deleted-server label `(deleted)` → Task 3 (`serverNameById.get(...) ?? "(deleted)"`).
- `export const dynamic = "force-dynamic"` retained → Task 8.
- Manual verification list from spec → Task 9 covers every bullet.

**Placeholder scan:** No TBDs, no "add appropriate error handling", no "similar to Task N", every code step has concrete code, every command has an expected output.

**Type consistency check:**
- `DashboardRange` used identically in Task 2, 3, 4, 8.
- `OverviewMetrics.topTools: { name, calls }[]` — consumed in Task 8 as `{ label: t.name, value: t.calls }`. Consistent.
- `formatCount` / `formatErrorRate` defined in Task 5, imported in Task 8. Names match.
- `ChartCard` prop `data: { label, value }[]` (Task 7) matches Task 8's call site.
- `UsageBarChart` prop `valueLabel` defaults to `"calls"` and Task 7 doesn't override it. Consistent.

No gaps, no placeholders, no name drift.
