/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added a same-origin rewrite from frontend API calls to the API Gateway and isolated the browser test build directory.
Author review: Jie Yang reviewed this file; integration testing remains pending.
*/
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.FRONTEND_TEST_DIST_DIR ?? ".next",
  // AI-generated (pending human review)
  async rewrites() {
    const gateway = process.env.FRONTEND_GATEWAY_URL ?? "http://localhost:3003";
    return [{ source: "/api/gateway/:path*", destination: `${gateway}/:path*` }];
  },
};

export default nextConfig;
