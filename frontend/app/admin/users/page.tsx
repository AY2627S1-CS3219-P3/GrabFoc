/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Added the admin list of suspended and deactivated accounts (docs/admin-dashboard-plan.md UC4, #184).
Author review: Reviewed and tested locally by Zi Yi, 2026-11-07.
*/
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminPage, Empty, useLeaveOnAuthError, UserPicker } from "../admin-page";
import { adminKeys, listUsers, useUsers } from "@/lib/admin";
import { formatTime } from "@/lib/orders";

export default function AdminUsersPage() {
  return <AdminPage section="users">{() => <Users />}</AdminPage>;
}

// AI-generated (reviewed by Zi Yi)
function Users() {
  const router = useRouter();
  const everyone = useUsers();
  const [status, setStatus] = useState<"SUSPENDED" | "DEACTIVATED">("SUSPENDED");
  const users = useQuery({ queryKey: adminKeys.users(status), queryFn: () => listUsers(status) });
  useLeaveOnAuthError(users.error, everyone.error);
  const suspended = status === "SUSPENDED";
  return <>
    <div className="home-heading">
      <div><h1>Users</h1><p>Find any account to review, suspend or reactivate it.</p></div>
      <div className="mode-switch" role="group" aria-label="Choose accounts">
        <button type="button" aria-pressed={suspended} onClick={() => setStatus("SUSPENDED")}>Suspended</button>
        <button type="button" aria-pressed={!suspended} onClick={() => setStatus("DEACTIVATED")}>Deactivated</button>
      </div>
    </div>
    <div className="location-filters mt-4 grid grid-cols-1 sm:grid-cols-2">
      <UserPicker label="Find a user" users={everyone.data} onPick={(user) => { if (user) router.push(`/admin/users/${user.userId}`); }} />
    </div>
    <h2 className="admin-subheading">{suspended ? "Suspended accounts" : "Deactivated accounts"}</h2>
    {users.error ? <p className="auth-message" role="alert">{users.error.message}</p>
      : !users.data ? <p role="status">Loading…</p>
      : users.data.length === 0 ? <Empty>No {status.toLowerCase()} accounts.</Empty>
      : <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>{suspended ? "Suspended" : "Deactivated"} since</th>{suspended && <th>Reason</th>}</tr></thead>
        <tbody>{users.data.map((user) => {
          const since = suspended ? user.suspendedAt : user.deactivatedAt;
          return <tr key={user.userId}>
            <td><Link className="admin-link" href={`/admin/users/${user.userId}`}>{user.displayName}</Link></td>
            <td>{user.email}</td><td>{since ? formatTime(since) : "—"}</td>
            {suspended && <td className="admin-reason">{user.suspensionReason}</td>}
          </tr>;
        })}</tbody>
      </table></div>}
  </>;
}
