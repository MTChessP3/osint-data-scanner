import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // z-ai-web-dev-sdk: keep as external to avoid fs.readFile issues in browser bundle.
  // The SDK works fine in serverless because we pass config directly via new ZAI(config).
  serverExternalPackages: ['sharp', 'pdfkit', 'z-ai-web-dev-sdk'],
  // Transpile xlsx for proper client-side bundling (dynamic import support)
  transpilePackages: ['xlsx'],
  // Empty turbopack config to silence the webpack/turbopack conflict warning
  turbopack: {},
};

export default nextConfig;
