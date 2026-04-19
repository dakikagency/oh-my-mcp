import type { Metadata } from "next";
import { NewServerWizard } from "@/components/dashboard/new-server-wizard";
import { requireOrgSession } from "@/server/session";

export const metadata: Metadata = { title: "New server" };
export const dynamic = "force-dynamic";

export default async function NewServerPage() {
  // The quick-create endpoint requires an active organization. Ensure one
  // exists up-front so the user never sees a 400 on submit.
  await requireOrgSession();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New MCP server</h1>
        <p className="text-sm text-muted-foreground">
          Paste an OpenAPI URL or document and we&apos;ll host the MCP endpoint.
        </p>
      </div>
      <NewServerWizard />
    </div>
  );
}
