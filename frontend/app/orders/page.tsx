/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added the Orders page: Requester/Courier tabs polling /orders/mine and /orders/assigned, active orders only, with edit and cancel for PENDING orders (docs/orders/frontend-integration-plan.md §3).
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Grouped both tabs into Active / Completed / Cancelled, fetching every page instead of filtering one page.
Author review: Pending review by Deanson.
*/
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { ErrorToast } from "../components/error-feedback";
import { ConfirmModal } from "../components/modal";
import { OrderCard } from "../components/order-card";
import { OrderFormModal } from "../components/order-form-modal";
import { SessionScreen, useSession } from "../components/use-session";
import { cancelOrder, groupOrders, isConflict, isUnauthorized, listAllOrders, type Order, orderKeys, POLL_MS } from "@/lib/orders";

type Tab = "requester" | "courier";

// AI-generated (pending review by Deanson)
export default function OrdersPage() {
  const session = useSession();
  const [tab, setTab] = useState<Tab>("requester");
  const [toast, setToast] = useState("");
  if (session.status !== "ready") return <SessionScreen failed={session.status === "error"} />;
  return <AppShell section="orders">
    <ErrorToast message={toast} onDismiss={() => setToast("")} />
    <div className="home-heading">
      <div><h1>My Orders</h1><p>{tab === "requester" ? "Orders you have requested." : "Orders you are delivering."}</p></div>
      <div className="mode-switch" role="group" aria-label="Choose orders">
        <button type="button" aria-pressed={tab === "requester"} onClick={() => setTab("requester")}>Requester</button>
        <button type="button" aria-pressed={tab === "courier"} onClick={() => setTab("courier")}>Courier</button>
      </div>
    </div>
    {/* key: switching tabs remounts the list, closing its history sections */}
    <OrderList key={tab} tab={tab} onError={setToast} />
  </AppShell>;
}

// AI-generated (pending review by Deanson)
function OrderList({ tab, onError }: { tab: Tab; onError: (message: string) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const list = tab === "requester" ? "mine" : "assigned";
  const [editing, setEditing] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  // The API has no status filter, so fetch every page and group here (plan §3).
  const orders = useQuery({ queryKey: orderKeys.everything(list), queryFn: () => listAllOrders(list), refetchInterval: POLL_MS });
  const cancel = useMutation({
    mutationFn: (order: Order) => cancelOrder(order.id, order.version),
    onSuccess: (order) => {
      queryClient.setQueryData(orderKeys.order(order.id), order);
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      setCancelling(null);
    },
    onError: (error) => {
      if (isUnauthorized(error)) { router.replace("/signin"); return; }
      setCancelling(null);
      onError(error.message);
      if (isConflict(error)) void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });

  useEffect(() => { if (isUnauthorized(orders.error)) router.replace("/signin"); }, [orders.error, router]);

  if (orders.isPending) return <div className="home-section home-empty" role="status">Loading orders…</div>;
  if (!orders.data) return <div className="home-section home-empty" role="alert">{orders.error?.message}
    <button type="button" className="text-button" onClick={() => void orders.refetch()}>Retry</button></div>;

  const { active, completed, cancelled } = groupOrders(orders.data);
  return <>
    <section className="home-section order-section" aria-labelledby={`${tab}-active-title`}>
      <h2 id={`${tab}-active-title`}>Active <span className="order-section-count">{active.length}</span></h2>
      {active.length === 0
        ? <div className="home-empty"><strong>No active orders</strong>
          <p>{tab === "requester" ? "Orders you create appear here until they finish." : "Orders you accept appear here until they finish."}</p></div>
        : <div className="order-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((order) => <OrderCard key={order.id} order={order} href={`/orders/${order.id}`} showStatus
            actions={tab === "requester" && order.status === "PENDING" ? <>
              <button type="button" className="icon-button" aria-label={`Edit ${order.orderDescription}`} title="Edit"
                onClick={() => setEditing(order)}>✎</button>
              <button type="button" className="icon-button icon-button--danger" aria-label={`Cancel ${order.orderDescription}`}
                title="Cancel" onClick={() => setCancelling(order)}>✕</button>
            </> : undefined} />)}
        </div>}
    </section>
    <FinishedSection title="Completed" orders={completed} empty="No completed orders yet." />
    <FinishedSection title="Cancelled" orders={cancelled} empty="No cancelled orders." />
    {editing && <OrderFormModal mode={{ kind: "edit", order: editing }} onClose={() => setEditing(null)}
      onSaved={() => setEditing(null)} />}
    {cancelling && <ConfirmModal title="Cancel order?" confirmLabel="Cancel order" busy={cancel.isPending}
      message={`"${cancelling.orderDescription}" will be cancelled and your credits released. This can't be undone.`}
      onConfirm={() => cancel.mutate(cancelling)} onClose={() => setCancelling(null)} />}
  </>;
}

// Finished orders aren't links: the detail page sends finished orders back to /home.
function FinishedSection({ title, orders, empty }: { title: string; orders: Order[]; empty: string }) {
  return <details className="home-section order-section">
    <summary><h2>{title} <span className="order-section-count">{orders.length}</span></h2></summary>
    {orders.length === 0 ? <p className="order-section-empty">{empty}</p>
      : <div className="order-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {orders.map((order) => <OrderCard key={order.id} order={order} showStatus />)}
      </div>}
  </details>;
}
