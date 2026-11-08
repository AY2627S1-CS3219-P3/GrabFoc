/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Added the admin order panel: details, participants and the history timeline with the cancellation reason (docs/admin-dashboard-plan.md UC1, #184).
Author review: Reviewed and tested locally by Zi Yi, 2026-11-07.
*/
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../components/modal";
import { StatusBadge } from "../components/order-card";
import { actionLabel, adminKeys, cancelReason, getHistory, orderNumber, useUserNames } from "@/lib/admin";
import { formatTime, type Order } from "@/lib/orders";

export function OrderNumber({ order }: { order: Order }) {
  return <span className="admin-order-number">{orderNumber(order.id)}</span>;
}

// AI-generated (reviewed by Zi Yi)
export function OrderPanel({ order, onClose }: { order: Order; onClose: () => void }) {
  const name = useUserNames();
  const history = useQuery({ queryKey: adminKeys.history(order.id), queryFn: () => getHistory(order.id) });
  const person = (userId: string | null) => userId === null ? "NA"
    : <Link className="admin-link" href={`/admin/users/${userId}`}>{name(userId)}</Link>;
  return <Modal title={`Order ${orderNumber(order.id)}`} onClose={onClose}>
    <StatusBadge status={order.status} />
    <dl className="order-facts admin-facts">
      <div><dt>Description</dt><dd>{order.orderDescription}</dd></div>
      <div><dt>Requester</dt><dd>{person(order.requesterId)}</dd></div>
      <div><dt>Courier</dt><dd>{person(order.courierId)}</dd></div>
      <div><dt>Pickup</dt><dd>{order.pickupName}</dd></div>
      <div><dt>Drop-off</dt><dd>{order.deliveryName}</dd></div>
      <div><dt>Credits</dt><dd>{order.creditOffer}</dd></div>
      <div><dt>Window</dt><dd>{formatTime(order.windowStart)} – {formatTime(order.windowEnd)}</dd></div>
    </dl>
    <h3 className="admin-subheading">Timeline</h3>
    {history.isPending ? <p role="status">Loading timeline…</p>
      : history.error ? <p role="alert">{history.error.message}</p>
      : <ol className="admin-timeline">
        {history.data.map((entry) => {
          const reason = cancelReason(entry, order, name);
          return <li key={entry.id} className={entry.action === "CANCELLED" ? "is-cancelled" : undefined}>
            <div className="admin-timeline-heading">
              <span className="flex flex-wrap items-center gap-2">
                {entry.newStatus && <StatusBadge status={entry.newStatus} />}<span>{actionLabel(entry.action)}</span>
              </span>
              <time dateTime={entry.occurredAt}>{formatTime(entry.occurredAt)}</time>
            </div>
            {reason && <p className="admin-timeline-reason">{reason}</p>}
          </li>;
        })}
      </ol>}
  </Modal>;
}

// AI-generated (reviewed by Zi Yi)
/** Orders as a table; a row's description opens the panel. Scrolls sideways on a phone. */
export function OrderTable({ orders, onOpen }: { orders: Order[]; onOpen: (order: Order) => void }) {
  const name = useUserNames();
  return <div className="admin-table-wrap"><table className="admin-table">
    <thead><tr><th>Order</th><th>Description</th><th>Status</th><th>Requester</th><th>Courier</th><th>Created</th></tr></thead>
    <tbody>{orders.map((order) => <tr key={order.id}>
      <td><button type="button" className="admin-link" onClick={() => onOpen(order)}><OrderNumber order={order} /></button></td>
      <td className="admin-description">{order.orderDescription}</td>
      <td><StatusBadge status={order.status} /></td>
      <td>{name(order.requesterId)}</td>
      <td>{name(order.courierId)}</td>
      <td>{formatTime(order.createdAt)}</td>
    </tr>)}</tbody>
  </table></div>;
}
