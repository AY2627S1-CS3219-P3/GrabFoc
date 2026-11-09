/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added the shared order card and pager for the Home and Orders pages.
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added StatusBadge, coloured from STATUS_COLORS.
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Redesigned the card as a ticket slip: route line from pickup to drop-off, perforated footer with the credit offer and actions.
Author review: Pending review by Jie Yang.
*/
import Link from "next/link";
import type { ReactNode } from "react";
import { type Order, type OrderStatus, STATUS_COLORS, STATUS_LABEL } from "@/lib/orders";
import { CoinIcon } from "./icons";

// AI-generated (pending review by Deanson)
export function StatusBadge({ status }: { status: OrderStatus }) {
  const { background, text } = STATUS_COLORS[status];
  return <span className="status-pill" style={{ background, color: text }}>{STATUS_LABEL[status]}</span>;
}

// AI-generated (pending review by Deanson; slip redesign pending review by Jie Yang)
export function OrderCard({ order, href, showStatus = false, actions }: {
  order: Order; href?: string; showStatus?: boolean; actions?: ReactNode;
}) {
  const body = <>
    <div className="order-card-heading">
      <h3>{order.orderDescription}</h3>
      {showStatus && <StatusBadge status={order.status} />}
    </div>
    <ol className="order-route" aria-label="Route">
      <li><span><small>Pickup</small>{order.pickupName}</span></li>
      <li><span><small>Drop-off</small>{order.deliveryName}</span></li>
    </ol>
  </>;
  return <article className="order-card">
    {href ? <Link className="order-card-link" href={href}>{body}</Link> : <div>{body}</div>}
    <div className="order-card-footer">
      <span className="order-card-credits"><CoinIcon size={20} />{order.creditOffer}
        <small>{order.creditOffer === 1 ? "credit" : "credits"}</small></span>
      {actions && <div className="order-card-actions">{actions}</div>}
    </div>
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
