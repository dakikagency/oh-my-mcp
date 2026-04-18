import Link from "next/link";
import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create your workspace</CardTitle>
        <CardDescription>Start building MCP servers from OpenAPI specs.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
