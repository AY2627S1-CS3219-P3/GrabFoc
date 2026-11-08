/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Added the admin Orders page: Live/Past, state filter, user search and paged table (docs/admin-dashboard-plan.md UC1, #184).
Author review: Reviewed and tested locally by Zi Yi, 2026-11-07.
*/
"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AdminPage, Empty, useLeaveOnAuthError, UserPicker } from "../admin-page";
import { OrderPanel, OrderTable } from "../order-panel";
import { Pager } from "../../components/order-card";
import { ADMIN_POLL_MS, adminKeys, listAdminOrders, type Scope, SCOPES, useUsers } from "@/lib/admin";
import { type Order, type OrderStatus, STATUS_LABEL } from "@/lib/orders";

export default function AdminOrdersPage() {
  return <AdminPage section="orders">{() => <Orders />}</AdminPage>;
}

// AI-generated (reviewed by Zi Yi)
function Orders() {
  const users = useUsers();
  const [scope, setScope] = useState<Scope>("live");
  const [state, setState] = useState<OrderStatus | "">("");
  const [userId, setUserId] = useState<string>();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Order | null>(null);
  const user = users.data?.find((candidate) => candidate.userId === userId);

  const filter = { scope, state: state || undefined, userId, page };
  const orders = useQuery({ queryKey: adminKeys.orders(filter), queryFn: () => listAdminOrders(filter),
    refetchInterval: scope === "live" ? ADMIN_POLL_MS : false, placeholderData: keepPreviousData });
  useLeaveOnAuthError(orders.error, users.error);

  return <>
    <div className="home-heading">
      <div><h1>Orders</h1><p>{scope === "live" ? "Orders in progress. Refreshes every 15 seconds." : "Completed and cancelled orders."}</p></div>
      <div className="mode-switch" role="group" aria-label="Choose orders">
        {(["live", "past"] as const).map((value) => <button key={value} type="button" aria-pressed={scope === value}
          onClick={() => { setScope(value); setState(""); setPage(1); }}>{value === "live" ? "Live" : "Past"}</button>)}
      </div>
    </div>
    <div className="location-filters mt-4 grid grid-cols-1 sm:grid-cols-2">
      <label><span>State</span><select value={state} onChange={(event) => { setState(event.target.value as OrderStatus | ""); setPage(1); }}>
        <option value="">All {scope} states</option>
        {SCOPES[scope].map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}
      </select></label>
      <UserPicker label="Requester or courier" users={users.data} selected={user}
        onPick={(picked) => { setUserId(picked?.userId); setPage(1); }} />
    </div>
    {orders.error ? <p className="auth-message" role="alert">{orders.error.message}</p>
      : !orders.data ? <p role="status">Loading orders…</p>
      : orders.data.items.length === 0 ? <Empty>No orders match.</Empty>
      : <><OrderTable orders={orders.data.items} onOpen={setOpen} />
        <Pager page={orders.data.page} pageSize={orders.data.pageSize} total={orders.data.total} onChange={setPage} /></>}
    {open && <OrderPanel order={open} onClose={() => setOpen(null)} />}
  </>;
}
