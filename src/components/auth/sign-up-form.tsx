"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { signUp } from "@/lib/auth-client";
import { api, apiAction, apiMutate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { randomSuffix, slugCandidates, slugify } from "@/lib/utils";

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      // Auto-create a personal workspace from the user's name. Slug
      // collisions across all orgs are disambiguated with short random
      // suffixes before we give up.
      const firstName = name.split(" ")[0] || "my";
      const orgName = `${firstName}'s Workspace`;
      const baseSlug = slugify(orgName) || `ws-${randomSuffix(6)}`;

      let createdOrgId: string | null = null;
      for (const slug of slugCandidates(baseSlug)) {
        const data = await apiMutate<{ organization: { id: string } }>(
          () => api.orgs.$post({ json: { name: orgName, slug } }),
          { silent: true }
        );
        if (data?.organization?.id) {
          createdOrgId = data.organization.id;
          break;
        }
      }

      if (!createdOrgId) {
        // Extremely rare: three random slugs collided. The server-side
        // `requireOrgSession` will create one for us on the next request,
        // so just land the user on the dashboard instead of stranding
        // them on an onboarding page they don't need.
        toast.success("Welcome aboard!");
        router.push("/dashboard");
        router.refresh();
        return;
      }

      await apiAction(
        () => api.orgs.active.$post({ json: { orgId: createdOrgId! } }),
        { silent: true }
      );
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
        {pending ? "Creating account…" : "Create account"}
        <ArrowRightIcon className="ml-1 h-4 w-4" />
      </Button>
    </form>
  );
}
