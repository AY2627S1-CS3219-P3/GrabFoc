/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added the TanStack Query provider, following the Next.js 16 TanStack Query guide.
Author review: Pending review by Deanson.
*/
"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderError } from "@/lib/orders";

let browserQueryClient: QueryClient | undefined;

// AI-generated (pending review by Deanson)
// Client errors (4xx) are answers, not outages, so only retry network and 5xx failures.
function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: {
    retry: (failures, error) => failures < 2 && !(error instanceof OrderError && error.status < 500),
  } } });
}

function getQueryClient() {
  // Keep server renders isolated and reuse one client in the browser.
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
