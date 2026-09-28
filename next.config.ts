import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // A stray lockfile in a parent directory can make Next.js misdetect the workspace root.
  // Pin it explicitly to this project.
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
