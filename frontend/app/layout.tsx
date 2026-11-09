/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-24
Scope: Updated page metadata and removed starter font styling for the Figma UI; renamed page metadata to GrabFoc on 2026-09-27; added an unsupported-browser notice for non-local HTTP on 2026-09-29.
Author review: Jie Yang reviewed this file; team visual verification remains pending.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Wrapped the app in the TanStack Query provider.
Author review: Pending review by Deanson.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Loaded the redesign's fonts (Bricolage Grotesque, Figtree) as CSS variables.
Author review: Pending review by Jie Yang.
*/
import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

// AI-generated (pending review by Jie Yang)
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const body = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "GrabFoc",
  description: "Campus orders, picked up and delivered by fellow students",
};

// AI-generated (reviewed by Jie Yang)
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const hostname = new URL(`http://${host || "localhost"}`).hostname;
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  const unsupported = requestHeaders.get("x-forwarded-proto") !== "https" && !local;

  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{unsupported ? (
        <main className="auth-page">
          <div className="auth-card">
            <h1>Browser not supported</h1>
            <p>GrabFOC does not support HTTP browsers.</p>
          </div>
        </main>
      ) : <Providers>{children}</Providers>}</body>
    </html>
  );
}
