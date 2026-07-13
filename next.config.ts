import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Worktrees can sit beneath a directory that contains an unrelated
  // lockfile. Pin tracing to this repository so standalone output keeps the
  // layout expected by the existing build script.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
