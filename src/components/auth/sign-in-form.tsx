"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { GithubLogoIcon, GoogleLogoIcon, ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const { error } = await signIn.email({
        email,
        password,
      });
      if (error) {
        toast.error(error.message ?? "Sign in failed.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  };

  const onSocial = (provider: "github" | "google") => {
    startTransition(async () => {
      await signIn.social({ provider, callbackURL: "/dashboard" });
    });
  };

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
          <ArrowRightIcon className="ml-1 h-4 w-4" />
        </Button>
      </form>

      <div className="relative py-2">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
          or continue with
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onSocial("github")}
          disabled={pending}
        >
          <GithubLogoIcon weight="fill" /> GitHub
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onSocial("google")}
          disabled={pending}
        >
          <GoogleLogoIcon weight="fill" /> Google
        </Button>
      </div>
    </div>
  );
}
