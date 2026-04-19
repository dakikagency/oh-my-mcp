"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import Link from "next/link";
import { SignOutIcon, UserCircleIcon, MoonIcon, SunIcon } from "@phosphor-icons/react/dist/ssr";
import { useTheme } from "next-themes";

import { signOut } from "@/lib/auth-client";
import { initialsOf } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface User {
  name: string;
  email: string;
  image?: string | null;
}

export function UserMenu({ user }: { user: User }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const initials = initialsOf(user.name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={pending}>
          <Avatar className="h-7 w-7">
            {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
            <AvatarFallback>{initials || <UserCircleIcon />}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">Account settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setTheme(theme === "dark" ? "light" : "dark");
          }}
        >
          {theme === "dark" ? (
            <>
              <SunIcon className="h-4 w-4" /> Light mode
            </>
          ) : (
            <>
              <MoonIcon className="h-4 w-4" /> Dark mode
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            startTransition(async () => {
              await signOut();
              router.push("/");
              router.refresh();
            });
          }}
        >
          <SignOutIcon className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
