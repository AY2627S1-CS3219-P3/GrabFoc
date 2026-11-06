/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Moved the location listing shell to /home; added live Supplier browsing on 2026-09-29.
Author review: Jie Yang reviewed this file; team visual review and live Supplier integration verification remain pending.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Replaced the order placeholders: Create Order button and modal (requester mode), polled Available Orders with Accept (courier mode), and the notice shown after leaving an unavailable order (docs/orders/frontend-integration-plan.md §2).
Author review: Pending review by Deanson.
*/
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { ErrorToast } from "../components/error-feedback";
import { OrderCard, Pager } from "../components/order-card";
import { OrderFormModal } from "../components/order-form-modal";
import { getSession } from "@/lib/session-client";
import { LocationBrowser } from "../components/location-browser";
import { acceptOrder, isConflict, isUnauthorized, listOrders, orderKeys, PAGE_SIZE, POLL_MS } from "@/lib/orders";

const NOTICES: Record<string, string> = { "order-unavailable": "That order doesn't exist or isn't available to you." };

// AI-generated (reviewed by Jie Yang; order sections pending review by Deanson)
export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"requester" | "courier">("requester");
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [role, setRole] = useState<"ADMIN" | "USER" | undefined>();
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState("");
  const [toast, setToast] = useState(() =>
    typeof window === "undefined" ? "" : NOTICES[new URLSearchParams(window.location.search).get("notice") ?? ""] ?? "");

  useEffect(() => {
    let active = true;
    getSession().then((session) => {
      if (!active) return;
      if (session.authenticated) {
        setRole(session.role); setReady(true);
        if (window.location.search) router.replace("/home");
      }
      else router.replace("/signin");
    }).catch(() => { if (active) setSessionError(true); });
    return () => { active = false; };
  }, [router]);

  if (!ready) return <main className="auth-page"><div className="auth-card">{sessionError ? <p>Could not check your session. <button onClick={() => window.location.reload()}>Retry</button></p> : <p>Checking your session…</p>}</div></main>;

  return (
    <AppShell section="locations">
      <ErrorToast message={toast} onDismiss={() => setToast("")} />
      <div className="home-heading">
        <div><h1>Welcome to GrabFoc</h1><p>{mode === "requester" ? "Find a campus pickup point for your next order." : "Browse available orders and earn credits as a courier."}</p></div>
        <div className="home-heading-actions">
          {mode === "requester" && <button type="button" className="primary-button" onClick={() => setCreating(true)}>Create Order</button>}
          <div className="mode-switch" role="group" aria-label="Choose mode">
            <button type="button" aria-pressed={mode === "requester"} onClick={() => setMode("requester")}>Requester</button>
            <button type="button" aria-pressed={mode === "courier"} onClick={() => setMode("courier")}>Courier</button>
          </div>
        </div>
      </div>
      {mode === "requester" && createdId && <p className="order-success" role="status">Order created.{" "}
        <Link href={`/orders/${createdId}`}>View order</Link>
        <button type="button" onClick={() => setCreatedId("")} aria-label="Dismiss">×</button></p>}
      {mode === "requester" ? <LocationBrowser role={role} /> : <AvailableOrders onError={setToast} />}
      {creating && <OrderFormModal mode={{ kind: "create" }} onClose={() => setCreating(false)}
        onSaved={(order) => { setCreating(false); setCreatedId(order.id); }} />}
    </AppShell>
  );
}

// AI-generated (pending review by Deanson)
function AvailableOrders({ onError }: { onError: (message: string) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const orders = useQuery({ queryKey: orderKeys.list("available", page), queryFn: () => listOrders("available", page),
    refetchInterval: POLL_MS });
  const accept = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => acceptOrder(id, version),
    onSuccess: (order) => {
      queryClient.setQueryData(orderKeys.order(order.id), order);
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      router.push(`/orders/${order.id}`);
    },
    onError: (error) => {
      if (isUnauthorized(error)) { router.replace("/signin"); return; }
      onError(error.message);
      if (isConflict(error)) void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });

  useEffect(() => { if (isUnauthorized(orders.error)) router.replace("/signin"); }, [orders.error, router]);

  return <section className="home-section" aria-labelledby="available-orders-title">
    <h2 id="available-orders-title">Available Orders</h2>
    {orders.isPending && <div className="home-empty" role="status">Loading orders…</div>}
    {orders.isError && !orders.data && <div className="home-empty" role="alert">{orders.error.message}
      <button type="button" className="text-button" onClick={() => void orders.refetch()}>Retry</button></div>}
    {orders.data && orders.data.items.length === 0 && <div className="home-empty"><strong>No orders available right now</strong>
      <p>New orders show up here automatically.</p></div>}
    {orders.data && orders.data.items.length > 0 && <>
      <div className="order-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {orders.data.items.map((order) => <OrderCard key={order.id} order={order} actions={
          <button type="button" className="primary-button" disabled={accept.isPending}
            onClick={() => accept.mutate({ id: order.id, version: order.version })}>
            {accept.isPending && accept.variables?.id === order.id ? "Accepting…" : "Accept"}
          </button>} />)}
      </div>
      <Pager page={page} pageSize={PAGE_SIZE} total={orders.data.total} onChange={setPage} />
    </>}
  </section>;
}
