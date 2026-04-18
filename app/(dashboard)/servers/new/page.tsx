import type { Metadata } from "next";
import { NewServerWizard } from "@/components/dashboard/new-server-wizard";
import { requireOrgSession } from "@/server/session";

export const metadata: Metadata = { title: "New server" };
export const dynamic = "force-dynamic";

export default async function NewServerPage() {
  // Every mutation in the wizard hits `/api/openapi/*` and `/api/servers`,
  // both of which require an active organization. Redirect to onboarding
  // up-front so users without an org don't click Import and get 400s.
  await requireOrgSession();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create MCP server</h1>
        <p className="text-sm text-muted-foreground">
          Import an OpenAPI document and pick which operations become tools.
        </p>
      </div>
      <NewServerWizard />
    </div>
  );
}
