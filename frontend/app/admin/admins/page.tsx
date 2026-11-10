/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Added the Admins page: current admins with Remove admin, and a search to make a user an admin.
Author review: Pending review by Zi Yi.
*/
"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminPage, RoleChangeModal, useLeaveOnAuthError, UserPicker } from "../admin-page";
import { type AdminUser, useUsers } from "@/lib/admin";
import { formatTime } from "@/lib/orders";

export default function AdminAdminsPage() {
  return <AdminPage section="admins">{(session) => <Admins selfId={session.userId} />}</AdminPage>;
}

// AI-generated (pending review by Zi Yi)
// Active admins only: a suspended admin keeps the role but can't sign in, so they show under Users > Suspended.
function Admins({ selfId }: { selfId?: string }) {
  const users = useUsers();
  const [changing, setChanging] = useState<AdminUser | null>(null);
  useLeaveOnAuthError(users.error);
  const active = users.data?.filter((user) => user.status === "ACTIVE");
  const admins = active?.filter((user) => user.role === "ADMIN");
  return <>
    <div className="home-heading">
      <div><h1>Admins</h1><p>See who can manage FoC, make a user an admin, or remove one.</p></div>
    </div>
    <div className="location-filters mt-4 grid grid-cols-1 sm:grid-cols-2">
      <UserPicker label="Make someone an admin" users={active?.filter((user) => user.role === "USER")} onPick={setChanging} />
    </div>
    <h2 className="admin-subheading">Current admins</h2>
    {users.error ? <p className="auth-message" role="alert">{users.error.message}</p>
      : !admins ? <p role="status">Loading…</p>
      : <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{admins.map((user) => <tr key={user.userId}>
          <td><Link className="admin-link" href={`/admin/users/${user.userId}`}>{user.displayName}</Link>{user.userId === selfId && " (you)"}</td>
          <td>{user.email}</td><td>{formatTime(user.createdAt)}</td>
          <td>{user.userId !== selfId && <button type="button" className="secondary-button" onClick={() => setChanging(user)}>Remove admin</button>}</td>
        </tr>)}</tbody>
      </table></div>}
    {changing && <RoleChangeModal user={changing} onClose={() => setChanging(null)} />}
  </>;
}
