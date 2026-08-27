import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // A stray lockfile above this repo otherwise makes Next.js pick the wrong workspace root.
    root: path.join(__dirname),
  },
  // In a codespace the browser reaches the dev server through a forwarded
  // HTTPS origin, not localhost, and Next.js blocks dev asset requests from
  // origins it was not told about.
  allowedDevOrigins: ["*.app.github.dev"],
};

export default nextConfig;
