/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-01
Scope: Added a same-origin gateway rewrite and isolated the browser test build directory; removed the unused remote image optimizer allowlist.
Author review: Jie Yang reviewed the earlier gateway rewrite; image change has been reviewed.
*/
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.FRONTEND_TEST_DIST_DIR ?? ".next",
  // AI-generated (reviewed by Jie Yang)
  async rewrites() {
    const gateway = process.env.FRONTEND_GATEWAY_URL ?? "http://localhost:3003";
    return [{ source: "/api/gateway/:path*", destination: `${gateway}/:path*` }];
  },
};

export default nextConfig;
