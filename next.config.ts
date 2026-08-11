import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Pin the workspace root to this app. Next 16 (Turbopack) otherwise infers the
  // root from the nearest lockfile, and a stray package-lock.json in a parent
  // directory (easy to create by running `npm install` one level up) makes it
  // pick the wrong root and fail to resolve modules. Anchoring here makes the app
  // build the same regardless of what surrounds the clone.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
