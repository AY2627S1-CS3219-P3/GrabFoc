/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added shared navigation for the User and location pages, using the existing authentication visual tokens.
Author review: Pending team review; no Figma frames exist for these pages.
*/
import Link from "next/link";
import type { ReactNode } from "react";

// AI-generated (pending human review)
export function AppShell({ section, children }: { section: "profile" | "locations"; children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="app-wordmark" href="/home" aria-label="GrabFoc home">
          <span className="auth-logo" aria-hidden="true">F</span>
          <span className="sr-only">GrabFoc</span>
        </Link>
        <nav className="app-nav" aria-label="Main navigation">
          <Link href="/home" aria-current={section === "locations" ? "page" : undefined}>Home</Link>
          <span aria-disabled="true" title="Orders are not available yet">My Orders</span>
          <Link href="/profile" aria-current={section === "profile" ? "page" : undefined}>Profile</Link>
        </nav>
        <div className="header-account" aria-label="Account information unavailable"><span className="header-avatar" aria-hidden="true">?</span></div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
