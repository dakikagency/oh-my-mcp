import Link from "next/link";
import { Plug } from "@phosphor-icons/react/dist/ssr";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,theme(colors.primary/10),transparent_60%)]" />
      <header className="container mx-auto flex h-14 items-center px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Plug weight="duotone" className="h-5 w-5 text-primary" />
          oh-my-mcp
        </Link>
      </header>
      <main className="container mx-auto flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-4 pb-16">
        {children}
      </main>
    </div>
  );
}
