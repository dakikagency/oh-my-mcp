import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Single source of truth for the app origin. Prefers the browser location
 * when available so client-rendered URLs match the tab the user is on,
 * falls back to `NEXT_PUBLIC_APP_URL`, and finally to `localhost:3000` for
 * the build-time / test case where neither is present.
 */
export function getAppOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function absoluteUrl(path: string): string {
  const base = getAppOrigin().replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function mcpUrlFor(slug: string): string {
  return `${getAppOrigin()}/mcp/${slug}`;
}

export function initialsOf(name: string, max = 2): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function randomSuffix(n: number): string {
  return Math.random().toString(36).slice(2, 2 + n);
}

export function looksLikeUrl(s: string): boolean {
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

export function slugCandidates(base: string, lengths: number[] = [4, 6, 8]): string[] {
  return [base, ...lengths.map((n) => `${base}-${randomSuffix(n)}`)];
}
