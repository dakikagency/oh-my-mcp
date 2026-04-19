"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DotsThreeVerticalIcon,
  GearSixIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  PencilIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiAction, serverRpc } from "@/lib/api";
import type { Visibility } from "@/lib/schemas";

interface Props {
  serverId: string;
  initialName: string;
  initialSlug: string;
  initialBaseUrl: string;
  visibility: Visibility;
}

/**
 * Kebab menu on the server-detail header. Consolidates the "Settings" tab
 * into three targeted actions: Rename, toggle visibility, Delete. The
 * "Advanced" dialog exposes slug + baseUrl for power users who need to
 * override the auto-derived defaults.
 */
export function ServerActionsMenu({
  serverId,
  initialName,
  initialSlug,
  initialBaseUrl,
  visibility,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [renameOpen, setRenameOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);

  const submitRename = () => {
    startTransition(async () => {
      const ok = await apiAction(
        () => serverRpc.$patch({ param: { serverId }, json: { name } }),
        { error: "Could not rename.", success: "Renamed." }
      );
      if (ok) {
        setRenameOpen(false);
        router.refresh();
      }
    });
  };

  const submitAdvanced = () => {
    startTransition(async () => {
      const ok = await apiAction(
        () => serverRpc.$patch({ param: { serverId }, json: { slug, baseUrl } }),
        { error: "Could not save.", success: "Saved." }
      );
      if (ok) {
        setAdvancedOpen(false);
        router.refresh();
      }
    });
  };

  const toggleVisibility = (next: Visibility) => {
    startTransition(async () => {
      const ok = await apiAction(
        () => serverRpc.$patch({ param: { serverId }, json: { visibility: next } }),
        {
          error: "Could not update visibility.",
          success:
            next === "PUBLIC"
              ? "Endpoint is now public."
              : next === "PRIVATE"
              ? "Endpoint now requires a bearer token."
              : "Endpoint is now unlisted.",
        }
      );
      if (ok) router.refresh();
    });
  };

  const destroy = () => {
    startTransition(async () => {
      const ok = await apiAction(
        () => serverRpc.$delete({ param: { serverId } }),
        { error: "Could not delete.", success: "Server deleted." }
      );
      if (ok) {
        router.push("/servers");
        router.refresh();
      }
    });
  };

  const isPublic = visibility === "PUBLIC";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Server actions">
            <DotsThreeVerticalIcon weight="bold" className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
            <PencilIcon className="h-4 w-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => toggleVisibility(isPublic ? "PRIVATE" : "PUBLIC")}
            disabled={pending}
          >
            {isPublic ? (
              <>
                <LockSimpleIcon className="h-4 w-4" /> Make private
              </>
            ) : (
              <>
                <LockSimpleOpenIcon className="h-4 w-4" /> Make public
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAdvancedOpen(true)}>
            <GearSixIcon className="h-4 w-4" /> Advanced…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <TrashIcon className="h-4 w-4" /> Delete server
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename server</DialogTitle>
            <DialogDescription>
              Only the display name changes. The MCP endpoint URL keeps its slug.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">Name</Label>
            <Input
              id="rename-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitRename} disabled={pending || !name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advanced settings</DialogTitle>
            <DialogDescription>
              Override the slug (changes the public MCP URL) or the upstream
              base URL. Most users never need these.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adv-slug">Slug</Label>
              <Input
                id="adv-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used in <code>/mcp/&lt;slug&gt;</code>.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adv-base">Base URL</Label>
              <Input
                id="adv-base"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdvancedOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAdvanced} disabled={pending}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete server?</DialogTitle>
            <DialogDescription>
              This permanently removes the server, its tools, credentials,
              and access tokens. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={destroy} disabled={pending}>
              <TrashIcon className="h-4 w-4" /> Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
