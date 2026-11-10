/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Moved the admin role gate out of admin/locations and added the admin navigation (docs/admin-dashboard-plan.md §8.2, #184).
Author review: Reviewed and tested locally by Zi Yi, 2026-11-07.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: UserPicker results now respond to clicks in Safari (pressing one no longer blurs the input and closes the list first);
  added RoleChangeModal, shared by the user page and the Admins page, and the Admins navigation item.
Author review: Pending review by Zi Yi.
*/
"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useId, useState } from "react";
import { AppShell } from "../components/app-shell";
import { Modal } from "../components/modal";
import { type Session, SessionScreen, useSession } from "../components/use-session";
import { type AdminUser, changeRole, USER_STATUS_COLORS, type UserStatus } from "@/lib/admin";
import { isConflict, OrderError } from "@/lib/orders";

type Section = "overview" | "orders" | "logins" | "users" | "admins" | "locations";
const NAV: [Section, string, string][] = [
  ["overview", "Overview", "/admin"], ["orders", "Orders", "/admin/orders"], ["logins", "Logins", "/admin/logins"],
  ["users", "Users", "/admin/users"], ["admins", "Admins", "/admin/admins"], ["locations", "Locations", "/admin/locations"],
];

// AI-generated (reviewed by Zi Yi)
/** Signed-out users go to /signin and non-admins to /home; the page renders only for an ADMIN. */
export function AdminPage({ section, children }: { section: Section; children: (session: Session) => ReactNode }) {
  const router = useRouter();
  const check = useSession();
  const admin = check.status === "ready" && check.session.role === "ADMIN";
  useEffect(() => { if (check.status === "ready" && !admin) router.replace("/home"); }, [check.status, admin, router]);
  if (check.status !== "ready" || !admin) return <SessionScreen failed={check.status === "error"} />;
  return <AppShell section="admin">
    <nav className="admin-nav" aria-label="Admin navigation">
      {NAV.map(([key, label, href]) => <Link key={key} href={href} aria-current={key === section ? "page" : undefined}>{label}</Link>)}
    </nav>
    {children(check.session)}
  </AppShell>;
}

/** A 401 means the session ended and a 403 that the role changed: leave the dashboard either way. */
export function useLeaveOnAuthError(...errors: unknown[]) {
  const router = useRouter();
  const status = errors.find((error) => error instanceof OrderError && (error.status === 401 || error.status === 403)) as OrderError | undefined;
  useEffect(() => { if (status) router.replace(status.status === 401 ? "/signin" : "/home"); }, [status, router]);
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="order-section-empty">{children}</p>;
}

const STATUS_TEXT: Record<UserStatus, string> = { ACTIVE: "Active", SUSPENDED: "Suspended", DEACTIVATED: "Deactivated" };

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { background, text } = USER_STATUS_COLORS[status];
  return <span className="status-pill" style={{ background, color: text }}>{STATUS_TEXT[status]}</span>;
}

// AI-generated (reviewed by Zi Yi)
/** Type part of a name or email, then pick from at most 8 matches shown under the box. */
export function UserPicker({ label, users, selected, onPick }: {
  label: string; users?: AdminUser[]; selected?: AdminUser; onPick: (user: AdminUser | null) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const typed = text.trim().toLowerCase();
  const matches = typed ? (users ?? []).filter((user) =>
    user.displayName.toLowerCase().includes(typed) || user.email.toLowerCase().includes(typed)).slice(0, 8) : [];
  if (selected) return <div className="user-picker">
    <span className="user-picker-label">{label}</span>
    <div className="user-picker-chosen">
      <span><strong>{selected.displayName}</strong> <small>{selected.email}</small></span>
      <button type="button" aria-label="Clear user" onClick={() => onPick(null)}>×</button>
    </div>
  </div>;
  return <div className="user-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label><span className="user-picker-label">{label}</span>
      <input type="search" value={text} placeholder="Type a name or email" role="combobox" aria-expanded={open && typed !== ""}
        aria-controls={listId} autoComplete="off" onFocus={() => setOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        onChange={(event) => { setText(event.target.value); setOpen(true); }} />
    </label>
    {open && typed !== "" && <ul id={listId} className="user-picker-list" role="listbox">
      {matches.length === 0 ? <li className="user-picker-empty">No matching users</li>
        : matches.map((user) => <li key={user.userId} role="option" aria-selected={false}>
          {/* Safari doesn't focus a clicked button, so without this the blur closes the list before the click lands. */}
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onPick(user); setText(""); setOpen(false); }}>
            <span><strong>{user.displayName}</strong><small>{user.email}</small></span><UserStatusBadge status={user.status} />
          </button>
        </li>)}
    </ul>}
  </div>;
}

// AI-generated (pending review by Zi Yi)
/** Confirms promoting a USER to ADMIN or demoting an ADMIN, then reloads every user list. */
export function RoleChangeModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const admin = user.role === "ADMIN";
  const refreshUsers = () => void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  // A 409 means the account changed first (suspended, or already demoted), so show why and reload.
  const change = useMutation({ mutationFn: () => changeRole(user.userId, admin ? "USER" : "ADMIN"),
    onSuccess: () => { refreshUsers(); onClose(); }, onError: (error) => { if (isConflict(error)) refreshUsers(); } });
  useLeaveOnAuthError(change.error);
  const label = admin ? "Remove admin" : "Make admin";
  return <Modal title={admin ? `Remove ${user.displayName} as admin?` : `Make ${user.displayName} an admin?`} onClose={onClose}>
    <p className="order-modal-text">{admin
      ? "They go back to being an ordinary user and lose the admin dashboard. This takes full effect within 15 minutes."
      : "They can manage locations, suspend and reactivate accounts, and change other users' roles, including yours. They get admin access the next time they sign in, or within 15 minutes."}</p>
    {change.error && <p className="field-error" role="alert">{change.error.message}</p>}
    <div className="order-modal-actions">
      <button type="button" className="secondary-button" onClick={onClose} disabled={change.isPending}>Back</button>
      <button type="button" className="danger-button" onClick={() => change.mutate()} disabled={change.isPending}>{change.isPending ? "Working…" : label}</button>
    </div>
  </Modal>;
}
