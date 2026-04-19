"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CaretUpDownIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";

import { api, apiAction, apiMutate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/utils";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export function OrgSwitcher({
  initialOrgs,
  activeOrgId,
}: {
  initialOrgs: OrgRow[];
  activeOrgId: string | null;
}) {
  const [orgs, setOrgs] = useState(initialOrgs);
  const [active, setActive] = useState(activeOrgId);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const router = useRouter();

  useEffect(() => {
    setOrgs(initialOrgs);
    setActive(activeOrgId);
  }, [initialOrgs, activeOrgId]);

  const current = orgs.find((o) => o.id === active) ?? orgs[0];

  const switchTo = (orgId: string) => {
    startTransition(async () => {
      const ok = await apiAction(
        () => api.orgs.active.$post({ json: { orgId } }),
        { error: "Could not switch organization." }
      );
      if (ok) {
        setActive(orgId);
        router.refresh();
      }
    });
  };

  const onCreate = () => {
    startTransition(async () => {
      const slug = newSlug.trim() || slugify(newName);
      const data = await apiMutate<{ organization: { id: string } }>(
        () => api.orgs.$post({ json: { name: newName, slug } }),
        { error: "Could not create organization." }
      );
      if (!data) return;
      await apiAction(
        () => api.orgs.active.$post({ json: { orgId: data.organization.id } }),
        { error: "Could not activate new organization.", success: "Organization created." }
      );
      setCreateOpen(false);
      setNewName("");
      setNewSlug("");
      router.refresh();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" disabled={pending}>
            <span className="truncate max-w-[160px]">
              {current?.name ?? "No organization"}
            </span>
            <CaretUpDownIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Your organizations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {orgs.map((o) => (
            <DropdownMenuItem key={o.id} onSelect={() => switchTo(o.id)}>
              <span className="flex-1 truncate">{o.name}</span>
              {o.id === active && <CheckIcon className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setCreateOpen(true); }}>
            <PlusIcon className="h-4 w-4" /> Create organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (!newSlug) setNewSlug(slugify(e.target.value));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={onCreate} disabled={pending || !newName}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
