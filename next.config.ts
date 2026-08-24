import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // A stray lockfile above this repo otherwise makes Next.js pick the wrong workspace root.
    root: path.join(__dirname),
  },
};

export default nextConfig;
