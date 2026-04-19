"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HouseIcon,
  StackIcon,
  UsersIcon,
  GearSixIcon,
  PlugIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/dashboard", label: "Overview", icon: HouseIcon },
  { href: "/servers", label: "Servers", icon: StackIcon },
  { href: "/org", label: "Organization", icon: UsersIcon },
  { href: "/account", label: "Account", icon: GearSixIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card/30 md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
        <PlugIcon weight="duotone" className="h-5 w-5 text-primary" />
        oh-my-mcp
      </div>
      <div className="flex-1 space-y-1 p-3">
        <Button asChild size="sm" className="mb-3 w-full justify-start gap-2">
          <Link href="/servers/new">
            <PlusIcon className="h-4 w-4" /> New server
          </Link>
        </Button>
        {nav.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                active && "bg-accent text-accent-foreground"
              )}
            >
              <item.icon weight="duotone" className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="border-t p-3 text-xs text-muted-foreground">
        <p>
          Docs:{" "}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            MCP spec
          </a>
        </p>
      </div>
    </aside>
  );
}
