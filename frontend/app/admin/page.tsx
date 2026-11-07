/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Added the admin Overview page (docs/admin-dashboard-plan.md UC6, #184).
Author review: Reviewed and tested locally by Zi Yi, 2026-11-07.
*/
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AdminPage, Empty, useLeaveOnAuthError } from "./admin-page";
import { OrderNumber, OrderPanel } from "./order-panel";
import { ADMIN_POLL_MS, adminKeys, getLoginSummary, getOverview, listUsers, OUTCOME_LABEL, SCOPES, useUserNames } from "@/lib/admin";
import { formatTime, type Order, STATUS_LABEL } from "@/lib/orders";

export default function AdminOverviewPage() {
  return <AdminPage section="overview">{() => <Overview />}</AdminPage>;
}

// AI-generated (reviewed by Zi Yi)
function Overview() {
  const name = useUserNames();
  const [open, setOpen] = useState<Order | null>(null);
  const orders = useQuery({ queryKey: adminKeys.overview, queryFn: getOverview, refetchInterval: ADMIN_POLL_MS });
  const logins = useQuery({ queryKey: adminKeys.loginSummary, queryFn: getLoginSummary, refetchInterval: ADMIN_POLL_MS });
  const suspended = useQuery({ queryKey: adminKeys.users("SUSPENDED"), queryFn: () => listUsers("SUSPENDED"), refetchInterval: ADMIN_POLL_MS });
  useLeaveOnAuthError(orders.error, logins.error, suspended.error);
  const error = orders.error ?? logins.error ?? suspended.error;

  return <>
    <div className="home-heading"><div><h1>Admin Overview</h1><p>Refreshes every 15 seconds.</p></div></div>
    {error && <p className="auth-message" role="alert">{error.message}</p>}
    <div className="admin-cards grid grid-cols-1 sm:grid-cols-3">
      <Link className="admin-card" href="/admin/orders">
        <span>Live orders</span><strong>{orders.data?.live.total ?? "…"}</strong>
        {orders.data && <small>{SCOPES.live.map((state) => `${STATUS_LABEL[state]} ${orders.data.live.byState[state] ?? 0}`).join(" · ")}</small>}
      </Link>
      <Link className="admin-card" href="/admin/logins">
        <span>Locked accounts</span><strong>{logins.data?.lockedNow ?? "…"}</strong><small>Locked in the last 15 minutes</small>
      </Link>
      <Link className="admin-card" href="/admin/users">
        <span>Suspended accounts</span><strong>{suspended.data?.length ?? "…"}</strong>
      </Link>
    </div>
    <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
      <section className="home-section" aria-labelledby="failures-title">
        <h2 id="failures-title">Recent failed logins</h2>
        {logins.data && (logins.data.recentFailures.length === 0 ? <Empty>Nothing in the last hour.</Empty>
          : <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Time</th><th>User</th><th>Outcome</th></tr></thead>
            <tbody>{logins.data.recentFailures.map((failure, index) => <tr key={`${failure.userId}-${failure.occurredAt}-${index}`}>
              <td>{formatTime(failure.occurredAt)}</td>
              <td><Link className="admin-link" href={`/admin/users/${failure.userId}`}>{failure.displayName}</Link></td>
              <td>{OUTCOME_LABEL[failure.outcome]}</td>
            </tr>)}</tbody>
          </table></div>)}
      </section>
      <section className="home-section" aria-labelledby="cancellations-title">
        <h2 id="cancellations-title">Recent cancellations</h2>
        {orders.data && (orders.data.recentCancellations.length === 0 ? <Empty>Nothing in the last hour.</Empty>
          : <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Order</th><th>Description</th><th>Requester</th><th>Courier</th><th>Cancelled</th></tr></thead>
            <tbody>{orders.data.recentCancellations.map((order) => <tr key={order.id}>
              <td><button type="button" className="admin-link" onClick={() => setOpen(order)}><OrderNumber order={order} /></button></td>
              <td className="admin-description">{order.orderDescription}</td>
              <td>{name(order.requesterId)}</td>
              <td>{name(order.courierId)}</td>
              <td>{formatTime(order.updatedAt)}</td>
            </tr>)}</tbody>
          </table></div>)}
      </section>
    </div>
    {open && <OrderPanel order={open} onClose={() => setOpen(null)} />}
  </>;
}
