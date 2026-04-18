"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { signUp, organization } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { slugify } from "@/lib/utils";

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const { error } = await signUp.email({ name, email, password });
      if (error) {
        toast.error(error.message ?? "Sign up failed.");
        return;
      }
      // Auto-create the first organization from the workspace name.
      const orgName = workspace.trim() || `${name.split(" ")[0]}'s Workspace`;
      const orgSlug = slugify(orgName) || `ws-${Math.random().toString(36).slice(2, 8)}`;
      const { data: org, error: orgErr } = await organization.create({
        name: orgName,
        slug: orgSlug,
      });
      if (orgErr) {
        toast.error(orgErr.message ?? "Could not create workspace.");
        return;
      }
      if (org?.id) {
        await organization.setActive({ organizationId: org.id });
      }
      toast.success("Welcome aboard!");
      router.push("/dashboard");
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ada Lovelace"
          autoComplete="name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="workspace">Workspace name</Label>
        <Input
          id="workspace"
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          placeholder="Acme Labs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating workspace…" : "Create account"}
        <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </form>
  );
}
