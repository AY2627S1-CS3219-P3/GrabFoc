/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Added the admin failed-login watchlist and the accounts locked now (docs/admin-dashboard-plan.md UC2, #184).
Author review: Reviewed and tested locally by Zi Yi, 2026-11-07.
*/
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AdminPage, Empty, useLeaveOnAuthError, UserStatusBadge } from "../admin-page";
import { ADMIN_POLL_MS, adminKeys, getLoginSummary, LOCK_MINUTES } from "@/lib/admin";
import { formatTime } from "@/lib/orders";

export default function AdminLoginsPage() {
  return <AdminPage section="logins">{() => <Logins />}</AdminPage>;
}

// AI-generated (reviewed by Zi Yi)
function Logins() {
  const summary = useQuery({ queryKey: adminKeys.loginSummary, queryFn: getLoginSummary, refetchInterval: ADMIN_POLL_MS });
  useLeaveOnAuthError(summary.error);
  // The wrong password that started a lock is a LOCKED failure; it is locked for LOCK_MINUTES from then.
  // ponytail: recentFailures is capped at 50 rows, so a flood of failures can hide a lock; the
  // Overview's lockedNow count has no cap. Add a locked list to login-summary if that happens.
  const lockMs = LOCK_MINUTES * 60_000;
  const locked = (summary.data?.recentFailures ?? [])
    .filter((event, index, all) => event.outcome === "LOCKED" && Date.parse(event.occurredAt) > summary.dataUpdatedAt - lockMs
      && all.findIndex((other) => other.outcome === "LOCKED" && other.userId === event.userId) === index);
  return <>
    <div className="home-heading"><div><h1>Failed logins</h1><p>Wrong passwords on existing accounts.</p></div></div>
    {summary.error ? <p className="auth-message" role="alert">{summary.error.message}</p>
      : !summary.data ? <p role="status">Loading…</p>
      : <>
        <div className="admin-cards grid grid-cols-1 sm:grid-cols-3">
          <div className="admin-card"><span>Failed logins, last 24 hours</span><strong>{summary.data.failedLast24h}</strong></div>
        </div>
        <section className="home-section" aria-labelledby="locked-title">
          <h2 id="locked-title">Locked accounts</h2>
          {locked.length === 0 ? <Empty>No account is locked.</Empty>
            : <div className="admin-table-wrap"><table className="admin-table">
              <thead><tr><th>User</th><th>Locked at</th><th>Unlocks at</th></tr></thead>
              <tbody>{locked.map((event) => <tr key={event.userId}>
                <td><Link className="admin-link" href={`/admin/users/${event.userId}`}>{event.displayName}</Link></td>
                <td>{formatTime(event.occurredAt)}</td><td>{formatTime(new Date(Date.parse(event.occurredAt) + lockMs).toISOString())}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>
        <section className="home-section" aria-labelledby="flagged-title">
          <h2 id="flagged-title">More than 10 failed logins in 24 hours</h2>
          {summary.data.flagged.length === 0 ? <Empty>No user has more than 10 failed logins in the last 24 hours.</Empty>
            : <div className="admin-table-wrap"><table className="admin-table">
              <thead><tr><th>User</th><th>Status</th><th>Failed logins</th><th>Last failed</th></tr></thead>
              <tbody>{summary.data.flagged.map((user) => <tr key={user.userId}>
                <td><Link className="admin-link" href={`/admin/users/${user.userId}`}>{user.displayName}</Link></td>
                <td><UserStatusBadge status={user.status} /></td><td>{user.failedCount}</td><td>{formatTime(user.lastFailedAt)}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>
      </>}
  </>;
}
