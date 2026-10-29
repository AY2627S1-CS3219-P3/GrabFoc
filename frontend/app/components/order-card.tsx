/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added the shared order card and pager for the Home and Orders pages.
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added StatusBadge, coloured from STATUS_COLORS.
Author review: Pending review by Deanson.
*/
import Link from "next/link";
import type { ReactNode } from "react";
import { type Order, type OrderStatus, STATUS_COLORS, STATUS_LABEL } from "@/lib/orders";

// AI-generated (pending review by Deanson)
export function StatusBadge({ status }: { status: OrderStatus }) {
  const { background, text } = STATUS_COLORS[status];
  return <span className="status-pill" style={{ background, color: text }}>{STATUS_LABEL[status]}</span>;
}

// AI-generated (pending review by Deanson)
export function OrderCard({ order, href, showStatus = false, actions }: {
  order: Order; href?: string; showStatus?: boolean; actions?: ReactNode;
}) {
  const body = <>
    <div className="order-card-heading">
      <h3>{order.orderDescription}</h3>
      {showStatus && <StatusBadge status={order.status} />}
    </div>
    <p><span>Pickup</span>{order.pickupName}</p>
    <p><span>Drop-off</span>{order.deliveryName}</p>
    <p className="order-card-credits">{order.creditOffer} {order.creditOffer === 1 ? "credit" : "credits"}</p>
  </>;
  return <article className="order-card">
    {href ? <Link className="order-card-link" href={href}>{body}</Link> : <div>{body}</div>}
    {actions && <div className="order-card-actions">{actions}</div>}
  </article>;
}

export function Pager({ page, pageSize, total, onChange }: {
  page: number; pageSize: number; total: number; onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <div className="location-pagination">
    <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
    <span>Page {page} of {pages}</span>
    <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
  </div>;
}
