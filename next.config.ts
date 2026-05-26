import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Force webpack instead of Turbopack for production build compatibility
  experimental: {
    turbo: undefined,
  },
};

export default nextConfig;
