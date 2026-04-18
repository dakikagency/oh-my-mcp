import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    reactCompiler: false,
  },
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon"],
};

// OpenNext Cloudflare dev bindings wiring (safe no-op at build time)
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();

export default nextConfig;
