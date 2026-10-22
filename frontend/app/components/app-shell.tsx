/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added shared navigation for the User and location pages, using the existing authentication visual tokens.
Author review: Jie Yang reviewed this file; team visual review remains pending because these pages have no Figma frames.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Enabled the My Orders link and added the orders section.
Author review: Pending review by Deanson.
*/
import Link from "next/link";
import type { ReactNode } from "react";

// AI-generated (reviewed by Jie Yang)
export function AppShell({ section, children }: { section: "profile" | "locations" | "orders"; children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="app-wordmark" href="/home" aria-label="GrabFoc home">
          <span className="auth-logo" aria-hidden="true">F</span>
          <span className="sr-only">GrabFoc</span>
        </Link>
        <nav className="app-nav" aria-label="Main navigation">
          <Link href="/home" aria-current={section === "locations" ? "page" : undefined}>Home</Link>
          <Link href="/orders" aria-current={section === "orders" ? "page" : undefined}>My Orders</Link>
          <Link href="/profile" aria-current={section === "profile" ? "page" : undefined}>Profile</Link>
        </nav>
        <div className="header-account" aria-label="Account information unavailable"><span className="header-avatar" aria-hidden="true">?</span></div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
