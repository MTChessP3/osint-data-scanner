import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NO usar output: "standalone" para Vercel
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Aumentar timeout para funciones serverless de escaneo OSINT
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
