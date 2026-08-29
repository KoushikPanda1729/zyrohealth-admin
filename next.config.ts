import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
