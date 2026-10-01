/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-01
Scope: Added a same-origin gateway rewrite and isolated the browser test build directory; enabled image optimization for the seeded GitHub image path.
Author review: Jie Yang reviewed the earlier version; image configuration awaits review.
*/
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.FRONTEND_TEST_DIST_DIR ?? ".next",
  // AI-generated (pending human review)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        port: "",
        pathname: "/CS3219-AY2627S1/FoC-Template/main/data/images/**",
        search: "",
      },
    ],
  },
  // AI-generated (reviewed by Jie Yang)
  async rewrites() {
    const gateway = process.env.FRONTEND_GATEWAY_URL ?? "http://localhost:3003";
    return [{ source: "/api/gateway/:path*", destination: `${gateway}/:path*` }];
  },
};

export default nextConfig;
