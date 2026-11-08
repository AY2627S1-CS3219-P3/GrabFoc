/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Added the admin user page: header, suspend and reactivate dialogs, Orders and Login history tabs (docs/admin-dashboard-plan.md UC5 and UC3, #184).
Author review: Reviewed and tested locally by Zi Yi, 2026-11-07.
*/
"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AdminPage, Empty, useLeaveOnAuthError, UserStatusBadge } from "../../admin-page";
import { OrderPanel, OrderTable } from "../../order-panel";
import { ErrorToast } from "../../../components/error-feedback";
import { ConfirmModal, Modal } from "../../../components/modal";
import { Pager } from "../../../components/order-card";
import { type AdminUser, adminKeys, listAdminOrders, listLoginEvents, OUTCOME_LABEL, reactivateUser, suspendUser, useUsers } from "@/lib/admin";
import { formatTime, isConflict, type Order } from "@/lib/orders";

export default function AdminUserPage() {
  const { userId } = useParams<{ userId: string }>();
  return <AdminPage section="users">{(session) => <UserDetail userId={userId} self={session.userId === userId} />}</AdminPage>;
}

// AI-generated (reviewed by Zi Yi)
function UserDetail({ userId, self }: { userId: string; self: boolean }) {
  const queryClient = useQueryClient();
  const users = useUsers();
  const [tab, setTab] = useState<"orders" | "logins">("orders");
  const [dialog, setDialog] = useState<"suspend" | "reactivate" | null>(null);
  const [toast, setToast] = useState("");
  const refreshUsers = () => void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  const changed = () => {
    setDialog(null);
    refreshUsers();
    void queryClient.invalidateQueries({ queryKey: adminKeys.loginSummary });
    // Suspension cancels the user's unfinished orders.
    void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
  };
  // A 409 means another admin changed the account first, so show its message and reload the header.
  const suspend = useMutation({ mutationFn: (reason: string) => suspendUser(userId, reason), onSuccess: changed,
    onError: (error) => { if (isConflict(error)) refreshUsers(); } });
  const reactivate = useMutation({ mutationFn: () => reactivateUser(userId), onSuccess: changed,
    onError: (error) => { setDialog(null); setToast(error.message); if (isConflict(error)) refreshUsers(); } });
  useLeaveOnAuthError(users.error, suspend.error, reactivate.error);

  if (users.error) return <p className="auth-message" role="alert">{users.error.message}</p>;
  if (!users.data) return <p role="status">Loading…</p>;
  const user = users.data.find((candidate) => candidate.userId === userId);
  if (!user) return <Empty>No such user.</Empty>;

  return <>
    <ErrorToast message={toast} onDismiss={() => setToast("")} />
    <div className="home-heading">
      <div>
        <div className="flex flex-wrap items-center gap-3"><h1>{user.displayName}</h1><UserStatusBadge status={user.status} /></div>
        <p>{user.email} · {user.role === "ADMIN" ? "Admin" : "User"}</p>
      </div>
      {!self && (user.status === "ACTIVE"
        ? <button type="button" className="admin-danger-button" onClick={() => { suspend.reset(); setDialog("suspend"); }}>Suspend</button>
        : <button type="button" className="primary-button" onClick={() => setDialog("reactivate")}>Reactivate</button>)}
    </div>
    {user.status === "SUSPENDED" && <div className="admin-banner admin-banner--danger" role="status">
      <strong>This account is suspended{user.suspendedAt && ` since ${formatTime(user.suspendedAt)}`}.</strong>
      <p>They can&apos;t sign in until an admin reactivates the account.</p>
      <p><span>Reason:</span> {user.suspensionReason}</p>
    </div>}
    {user.status === "DEACTIVATED" && <div className="admin-banner" role="status">
      <strong>This account is deactivated{user.deactivatedAt && ` since ${formatTime(user.deactivatedAt)}`}.</strong>
      <p>The user closed it themselves. Reactivating lets them sign in again.</p>
    </div>}
    <div className="mode-switch mt-4" role="group" aria-label="Choose records">
      <button type="button" aria-pressed={tab === "orders"} onClick={() => setTab("orders")}>Orders</button>
      <button type="button" aria-pressed={tab === "logins"} onClick={() => setTab("logins")}>Login history</button>
    </div>
    {tab === "orders" ? <UserOrders userId={userId} /> : <LoginHistory userId={userId} />}
    {dialog === "suspend" && <SuspendDialog user={user} busy={suspend.isPending} error={suspend.error?.message}
      onConfirm={(reason) => suspend.mutate(reason)} onClose={() => setDialog(null)} />}
    {dialog === "reactivate" && <ConfirmModal title={`Reactivate ${user.displayName}?`} confirmLabel="Reactivate" busy={reactivate.isPending}
      message="They can sign in again and get an email saying their account is active. Orders cancelled by the suspension stay cancelled."
      onConfirm={() => reactivate.mutate()} onClose={() => setDialog(null)} />}
  </>;
}

function SuspendDialog({ user, busy, error, onConfirm, onClose }: {
  user: AdminUser; busy: boolean; error?: string; onConfirm: (reason: string) => void; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); onConfirm(reason.trim()); };
  return <Modal title={`Suspend ${user.displayName}?`} onClose={onClose}>
    <form className="order-form" onSubmit={submit}>
      <ul className="admin-warnings">
        <li>They are signed out and can&apos;t sign in until an admin reactivates them.</li>
        <li>Any orders they have in progress are cancelled straight away. Reactivating won&apos;t bring them back.</li>
        <li>The suspension takes full effect within 15 minutes.</li>
        <li>They get an email saying their account has been suspended.</li>
      </ul>
      <label>Reason
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500}
          placeholder="Why are you suspending this account?" />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="order-modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Back</button>
        <button type="submit" className="admin-danger-button" disabled={busy || reason.trim() === ""}>{busy ? "Working…" : "Suspend"}</button>
      </div>
    </form>
  </Modal>;
}

function UserOrders({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Order | null>(null);
  const filter = { userId, page };
  const orders = useQuery({ queryKey: adminKeys.orders(filter), queryFn: () => listAdminOrders(filter), placeholderData: keepPreviousData });
  useLeaveOnAuthError(orders.error);
  return <section className="home-section" aria-label="Orders">
    {orders.error ? <p role="alert">{orders.error.message}</p>
      : !orders.data ? <p role="status">Loading orders…</p>
      : orders.data.items.length === 0 ? <Empty>No orders as requester or courier.</Empty>
      : <><OrderTable orders={orders.data.items} onOpen={setOpen} />
        <Pager page={orders.data.page} pageSize={orders.data.pageSize} total={orders.data.total} onChange={setPage} /></>}
    {open && <OrderPanel order={open} onClose={() => setOpen(null)} />}
  </section>;
}

function LoginHistory({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const events = useQuery({ queryKey: adminKeys.loginEvents(userId, page), queryFn: () => listLoginEvents(userId, page), placeholderData: keepPreviousData });
  useLeaveOnAuthError(events.error);
  return <section className="home-section" aria-label="Login history">
    {events.error ? <p role="alert">{events.error.message}</p>
      : !events.data ? <p role="status">Loading login history…</p>
      : events.data.items.length === 0 ? <Empty>No recorded logins.</Empty>
      : <><div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Time</th><th>Outcome</th></tr></thead>
        <tbody>{events.data.items.map((event, index) => <tr key={`${event.occurredAt}-${index}`}>
          <td>{formatTime(event.occurredAt)}</td><td>{OUTCOME_LABEL[event.outcome]}</td>
        </tr>)}</tbody>
      </table></div>
        <Pager page={events.data.page} pageSize={events.data.pageSize} total={events.data.total} onChange={setPage} /></>}
  </section>;
}
