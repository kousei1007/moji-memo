import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // kuromoji reads its dictionary from disk with Node's fs, so keep it out of the bundle
  // and make sure the dictionary ships with the API routes when deployed.
  serverExternalPackages: ["kuromoji"],
  outputFileTracingIncludes: {
    "/api/*": ["./node_modules/kuromoji/dict/**"],
  },
  // Self-contained server in .next/standalone — this is what the desktop (Electron) app runs.
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
