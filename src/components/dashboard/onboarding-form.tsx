"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

import { organization } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/utils";

export function OnboardingForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Tracks whether the user has manually edited the slug. Until they
  // do, we keep the slug in sync with the workspace name so a partial
  // slug doesn't get submitted.
  const [slugTouched, setSlugTouched] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const onNameChange = (next: string) => {
    setName(next);
    if (!slugTouched) setSlug(slugify(next));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const finalSlug = slug.trim() || slugify(name);
      const { data, error } = await organization.create({ name, slug: finalSlug });
      if (error) {
        toast.error(error.message ?? "Could not create organization.");
        return;
      }
      if (data?.id) await organization.setActive({ organizationId: data.id });
      toast.success("Workspace ready.");
      router.push("/dashboard");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="on-name">Workspace name</Label>
        <Input
          id="on-name"
          required
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Acme Labs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="on-slug">Slug</Label>
        <Input
          id="on-slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          placeholder="acme-labs"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending || !name}>
        {pending ? "Creating…" : "Create workspace"}
        <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </form>
  );
}
