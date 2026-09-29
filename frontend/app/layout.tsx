/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-24
Scope: Updated page metadata and removed starter font styling for the Figma UI; renamed page metadata to GrabFoc on 2026-09-27; added an unsupported-browser notice for non-local HTTP on 2026-09-29.
Author review: Jie Yang reviewed this file; team visual verification remains pending.
*/
import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "GrabFoc",
  description: "Sign in to GrabFoc",
};

// AI-generated (reviewed by Jie Yang)
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const hostname = new URL(`http://${host || "localhost"}`).hostname;
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  const unsupported = requestHeaders.get("x-forwarded-proto") !== "https" && !local;

  return (
    <html lang="en">
      <body>{unsupported ? (
        <main className="auth-page">
          <div className="auth-card">
            <h1>Browser not supported</h1>
            <p>GrabFOC does not support HTTP browsers.</p>
          </div>
        </main>
      ) : children}</body>
    </html>
  );
}
