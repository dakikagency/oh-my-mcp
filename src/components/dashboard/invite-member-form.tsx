"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";

import { organization } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InviteMemberForm({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "admin" | "member">("member");
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const { error } = await organization.inviteMember({
        email,
        role,
        organizationId: orgId,
      });
      if (error) {
        toast.error(error.message ?? "Could not send invitation.");
        return;
      }
      toast.success(`Invitation sent to ${email}.`);
      setEmail("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@example.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm sm:w-40"
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        <PaperPlaneTilt className="h-4 w-4" /> Send invite
      </Button>
    </form>
  );
}
