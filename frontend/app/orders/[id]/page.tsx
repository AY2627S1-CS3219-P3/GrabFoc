/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added the order detail page: polled order and pending proposal, "viewing as" label, lifecycle line, courier steps, Request Completion, cancellation and Accept/Reject (docs/orders/frontend-integration-plan.md §4, decisions 1–10).
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added the coloured status badge next to the order description.
Author review: Pending review by Deanson.
*/
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { ErrorToast } from "../../components/error-feedback";
import { ConfirmModal } from "../../components/modal";
import { StatusBadge } from "../../components/order-card";
import { SessionScreen, useSession } from "../../components/use-session";
import { advanceOrder, cancelOrder, type Confirmation, formatTime, getConfirmations, getOrder, isConflict, isFinished,
  isUnauthorized, type Order, OrderError, orderKeys, type OrderStatus, POLL_MS, propose, respond, STATUS_LABEL,
  type Step } from "@/lib/orders";

type Role = "requester" | "courier";

const LIFECYCLE: OrderStatus[] = ["PENDING", "ACCEPTED", "PICKED_UP", "IN_PROGRESS", "ARRIVED", "COMPLETED"];
const IN_DELIVERY: OrderStatus[] = ["ACCEPTED", "PICKED_UP", "IN_PROGRESS", "ARRIVED"];
const STEPS: Partial<Record<OrderStatus, { step: Step; label: string }>> = {
  ACCEPTED: { step: "pick-up", label: "Pick up" },
  PICKED_UP: { step: "start-delivery", label: "Start delivery" },
  IN_PROGRESS: { step: "arrive", label: "Arrived" },
};
const VERB: Record<Confirmation["kind"], string> = {
  CANCELLATION: "cancel", COMPLETION: "complete", TIMING_CHANGE: "change the timing of",
};

// AI-generated (pending review by Deanson)
export default function OrderPage() {
  const session = useSession();
  const { id } = useParams<{ id: string }>();
  if (session.status !== "ready") return <SessionScreen failed={session.status === "error"} />;
  return <OrderDetail id={id} userId={session.session.userId} />;
}

function OrderDetail({ id, userId }: { id: string; userId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState("");
  const [confirming, setConfirming] = useState(false);
  // dataUpdatedAt of the proposals when Request Completion got a 409; the next fetch clears it (decision 1).
  const [completionBlockedAt, setCompletionBlockedAt] = useState<number | null>(null);

  const orderQuery = useQuery({ queryKey: orderKeys.order(id), queryFn: () => getOrder(id), refetchInterval: POLL_MS });
  const order = orderQuery.data;
  const role: Role | null = !order || !userId ? null
    : order.requesterId === userId ? "requester" : order.courierId === userId ? "courier" : null;
  // Proposals only exist once accepted, and only participants may read them (decision 6).
  const proposals = useQuery({ queryKey: orderKeys.confirmations(id), queryFn: () => getConfirmations(id),
    refetchInterval: POLL_MS, enabled: role !== null && order !== undefined && IN_DELIVERY.includes(order.status) });
  const pending = proposals.data?.find((proposal) => proposal.status === "PENDING");

  // Finished orders, and orders this user can't see, send them home (plan §4).
  useEffect(() => {
    const error = orderQuery.error ?? proposals.error;
    if (isUnauthorized(error)) router.replace("/signin");
    else if (orderQuery.error instanceof OrderError && [400, 403, 404].includes(orderQuery.error.status)) {
      router.replace("/home?notice=order-unavailable");
    } else if (order && isFinished(order)) router.replace("/home");
  }, [order, orderQuery.error, proposals.error, router]);

  function failed(error: Error) {
    if (isUnauthorized(error)) { router.replace("/signin"); return; }
    setToast(error.message);
    if (isConflict(error)) refresh();
  }
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: orderKeys.order(id) });
    void queryClient.invalidateQueries({ queryKey: orderKeys.confirmations(id) });
    void queryClient.invalidateQueries({ queryKey: orderKeys.all });
  }
  function updated(next: Order) {
    queryClient.setQueryData(orderKeys.order(id), next);
    void queryClient.invalidateQueries({ queryKey: orderKeys.all });
  }

  const step = useMutation({
    mutationFn: ({ step, version }: { step: Step; version: number }) => advanceOrder(id, step, version),
    onSuccess: updated, onError: failed,
  });
  const directCancel = useMutation({
    mutationFn: (version: number) => cancelOrder(id, version),
    onSuccess: (next) => { setConfirming(false); updated(next); },
    onError: (error) => { setConfirming(false); failed(error); },
  });
  const proposal = useMutation({
    mutationFn: (kind: "CANCELLATION" | "COMPLETION") => propose(id, kind),
    onSuccess: () => { setConfirming(false); refresh(); },
    onError: (error, kind) => {
      setConfirming(false);
      if (kind === "COMPLETION" && isConflict(error)) setCompletionBlockedAt(proposals.dataUpdatedAt);
      failed(error);
    },
  });
  const answer = useMutation({
    mutationFn: ({ confirmationId, response }: { confirmationId: string; response: "ACCEPTED" | "REJECTED" }) =>
      respond(id, confirmationId, response),
    onSuccess: refresh, onError: failed,
  });

  if (!order) return <AppShell section="orders">
    {orderQuery.isError && !(orderQuery.error instanceof OrderError && orderQuery.error.status < 500)
      ? <div className="home-empty" role="alert">{orderQuery.error.message}
        <button type="button" className="text-button" onClick={() => void orderQuery.refetch()}>Retry</button></div>
      : <div className="home-empty" role="status">Loading order…</div>}
  </AppShell>;

  const busy = step.isPending || directCancel.isPending || proposal.isPending || answer.isPending;
  const inDelivery = IN_DELIVERY.includes(order.status);
  const other = role === "requester" ? "courier" : "requester";
  const current = LIFECYCLE.indexOf(order.status);
  const completionBlocked = completionBlockedAt !== null && completionBlockedAt === proposals.dataUpdatedAt;
  // While proposals are loading we don't yet know whether one is pending, so hold the proposal buttons.
  const proposalsUnknown = inDelivery && !proposals.data;
  const cancelHint = pending ? (pending.proposedBy === userId ? "Waiting for a response to your proposal." : "Respond to the pending proposal first.") : "";
  const canCancel = role === "requester" ? order.status === "PENDING" || inDelivery : role === "courier" && inDelivery;
  const nextStep = STEPS[order.status];

  return <AppShell section="orders">
    <ErrorToast message={toast} onDismiss={() => setToast("")} />
    <div className="home-heading">
      <div><h1>Order details</h1><p>Created {formatTime(order.createdAt)}</p></div>
      {role && <span className="status-pill">Viewing as {role === "requester" ? "Requester" : "Courier"}</span>}
    </div>
    <div className="order-detail grid grid-cols-1 md:grid-cols-2">
      <section className="order-panel" aria-label="Order">
        <div className="order-panel-heading">
          <h2>{order.orderDescription}</h2>
          <StatusBadge status={order.status} />
        </div>
        {order.status !== "AWAITING_CREDIT" && <ol className="order-lifecycle" aria-label={`Status: ${STATUS_LABEL[order.status]}`}>
            {LIFECYCLE.map((status, index) => <li key={status}
              className={index < current ? "is-done" : index === current ? "is-current" : undefined}
              aria-current={index === current ? "step" : undefined}>{STATUS_LABEL[status]}</li>)}
          </ol>}
        <dl className="order-facts">
          <div><dt>Pickup</dt><dd>{order.pickupName}</dd></div>
          <div><dt>Drop-off</dt><dd>{order.deliveryName}</dd></div>
          <div><dt>Credit offer</dt><dd>{order.creditOffer} {order.creditOffer === 1 ? "credit" : "credits"}</dd></div>
          <div><dt>Window</dt><dd>{formatTime(order.windowStart)} – {formatTime(order.windowEnd)}</dd></div>
        </dl>

        {role && pending && <div className={`proposal-box${pending.proposedBy === userId ? "" : " proposal-box--action"}`} role="status">
          {pending.proposedBy === userId ? <>
            <strong>WAITING</strong>
            <p>You proposed to {VERB[pending.kind]} the order. The {other} needs to accept before anything changes.</p>
          </> : <>
            <strong>NEEDS YOUR RESPONSE</strong>
            <p>The {other} has proposed to {VERB[pending.kind]} the order.</p>
            <div className="order-actions">
              <button type="button" className="primary-button" disabled={busy}
                onClick={() => answer.mutate({ confirmationId: pending.id, response: "ACCEPTED" })}>Accept</button>
              <button type="button" className="secondary-button" disabled={busy}
                onClick={() => answer.mutate({ confirmationId: pending.id, response: "REJECTED" })}>Reject</button>
            </div>
          </>}
        </div>}

        {role && (canCancel || (role === "courier" && inDelivery)) && <div className="order-actions">
          {role === "courier" && nextStep && <button type="button" className="primary-button" disabled={busy}
            onClick={() => step.mutate({ step: nextStep.step, version: order.version })}>{nextStep.label}</button>}
          {role === "courier" && order.status === "ARRIVED" && <button type="button" className="primary-button"
            disabled={busy || proposalsUnknown || Boolean(pending) || completionBlocked}
            onClick={() => proposal.mutate("COMPLETION")}>Request Completion</button>}
          {canCancel && <button type="button" className="danger-button"
            disabled={busy || (inDelivery && (proposalsUnknown || Boolean(pending)))}
            onClick={() => setConfirming(true)}>Cancel</button>}
          {cancelHint && canCancel && inDelivery && <p className="order-hint">{cancelHint}</p>}
        </div>}
      </section>
      <section className="order-panel order-chat" aria-label="Chat">
        <h2>Chat</h2>
        <div className="home-empty">Real-time chat is coming in a later phase.</div>
      </section>
    </div>
    {confirming && (order.status === "PENDING"
      ? <ConfirmModal title="Cancel order?" confirmLabel="Cancel order" busy={directCancel.isPending}
        message="This order will be cancelled and your credits released. This can't be undone."
        onConfirm={() => directCancel.mutate(order.version)} onClose={() => setConfirming(false)} />
      : <ConfirmModal title="Propose cancelling?" confirmLabel="Send proposal" busy={proposal.isPending}
        message={`The ${other} must accept before the order is cancelled.`}
        onConfirm={() => proposal.mutate("CANCELLATION")} onClose={() => setConfirming(false)} />)}
  </AppShell>;
}
