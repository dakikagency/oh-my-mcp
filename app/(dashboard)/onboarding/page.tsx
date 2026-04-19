import { OnboardingForm } from "@/components/dashboard/onboarding-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Create your first organization</CardTitle>
          <CardDescription>
            Your MCP servers and credentials live inside organizations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm />
        </CardContent>
      </Card>
    </div>
  );
}
