import type { Metadata } from "next";
import { NewServerWizard } from "@/components/dashboard/new-server-wizard";

export const metadata: Metadata = { title: "New server" };

export default function NewServerPage() {
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
