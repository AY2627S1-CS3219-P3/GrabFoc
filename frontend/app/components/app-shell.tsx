/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added shared navigation for the User and location pages, using the existing authentication visual tokens.
Author review: Jie Yang reviewed this file; team visual review remains pending because these pages have no Figma frames.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Enabled the My Orders link and added the orders section.
Author review: Pending review by Deanson.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Redesign: route logo and wordmark, a mode prop that sets data-mode (requester orange / courier blue) on the page, and a mode chip in the header.
Author review: Pending review by Jie Yang.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
Scope: Removed the hardcoded "?" avatar circle from the header; the mode chip stays.
Author review: Pending review by Deanson.
*/
import Link from "next/link";
import type { ReactNode } from "react";
import { BagIcon, BikeIcon, RouteMark } from "./icons";

export type Mode = "requester" | "courier";

// AI-generated (reviewed by Jie Yang; redesign pending review by Jie Yang)
export function AppShell({ section, mode, children }: { section: "profile" | "locations" | "orders" | "admin"; mode?: Mode; children: ReactNode }) {
  return (
    <div className="app-shell" data-mode={mode}>
      <header className="app-header">
        <Link className="app-wordmark" href="/home" aria-label="GrabFoc home">
          <RouteMark />
          <span className="app-wordmark-text" aria-hidden="true">GrabFoc</span>
        </Link>
        <nav className="app-nav" aria-label="Main navigation">
          <Link href="/home" aria-current={section === "locations" ? "page" : undefined}>Home</Link>
          <Link href="/orders" aria-current={section === "orders" ? "page" : undefined}>My Orders</Link>
          <Link href="/profile" aria-current={section === "profile" ? "page" : undefined}>Profile</Link>
        </nav>
        <div className="header-account">
          {mode && <span className="header-mode">{mode === "courier" ? <><BikeIcon size={14} />Courier mode</> : <><BagIcon size={14} />Requester mode</>}</span>}
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
