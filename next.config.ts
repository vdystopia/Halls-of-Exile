import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the Docker image.
  output: "standalone",
  // better-sqlite3 is a native module: keep it out of the bundler.
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // A whole account exported from Path of Exile is a few megabytes of JSON,
    // and it is uploaded to a server action. The default ceiling is 1 MB.
    serverActions: { bodySizeLimit: "32mb" },
  },
};

export default nextConfig;
