/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added the User profile route and a truthful unconnected state pending User Service contract.
Author review: Pending team review; no Figma profile frame exists.
*/
import Link from "next/link";
import { AppShell } from "../components/app-shell";

// AI-generated (pending human review)
export default function ProfilePage() {
  return (
    <AppShell section="profile">
      <h1 className="dashboard-title">Profile &amp; Settings</h1>
      <div className="profile-grid">
        <section className="profile-card" aria-labelledby="profile-name">
          <div className="profile-avatar" aria-hidden="true">?</div>
          <h2 id="profile-name">Your profile</h2>
          <p className="profile-email">Sign in to view your details</p>
          <Link className="outline-link" href="/">Sign in to edit profile</Link>
          <div className="profile-divider" />
          <span className="outline-link outline-link--muted" aria-disabled="true">Log Out</span>
        </section>
        <div className="profile-content">
          <section className="credit-card" aria-labelledby="credit-heading">
            <h2 id="credit-heading">Credit Balance</h2>
            <div className="credit-values">
              <div><strong className="credit-available">—</strong><span>available</span></div>
              <div><strong className="credit-reserved">—</strong><span>reserved for active orders</span></div>
            </div>
            <span className="credit-history" aria-disabled="true">View transaction history →</span>
          </section>
          <div className="profile-stats" aria-label="Order and credit totals">
            <div className="stat-card"><strong>—</strong><span>Orders Requested</span></div>
            <div className="stat-card"><strong>—</strong><span>Orders Delivered</span></div>
            <div className="stat-card"><strong>—</strong><span>Credits Earned</span></div>
          </div>
          <p className="data-note">Your account and credit information will appear when User and Credit Service integration is ready.</p>
        </div>
      </div>
    </AppShell>
  );
}
