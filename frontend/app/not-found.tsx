/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-27
Scope: Page shown for unknown paths, now that every non-API path on the site reaches the frontend
       (deploy part 1, #141). The wording is Claude's call.
Author review: Pending review.
*/
import Link from "next/link";

// AI-generated (Claude Code, 2026-10-27; pending review)
export default function NotFound() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Page not found</h1>
        <p>This page doesn&apos;t exist or has moved.</p>
        <Link href="/">Back to Home</Link>
      </div>
    </main>
  );
}
