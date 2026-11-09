/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added frontend types, query keys and fetchers for the existing Order Service contract (docs/orders/frontend-integration-plan.md §1).
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added listAllOrders() and groupOrders() for the Orders page's Active / Completed / Cancelled sections.
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added STATUS_COLORS, the status badge colours.
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Added HistoryEntry, getHistory(), detailOf(), suspendedSide() and cancelledBecause(), so a cancelled order's page can say why and whose account was suspended (#184).
Author review: Reviewed and tested locally by Zi Yi, 2026-11-07.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: cancelledBecause() words a SUPPLIER_DEACTIVATED cancellation (#121's reason).
Author review: Pending review by Zi Yi.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Retuned the status badge colours to the redesign palette (PENDING now gold, waiting for a courier).
Author review: Pending review by Jie Yang.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
Scope: Added optional windowStart / windowEnd to OrderInput (and so OrderEdit), matching the existing POST/PATCH bodies.
Author review: Pending review by Deanson.
*/
import { withSessionMutation } from '@/lib/session-client';
import { type FieldIssue, parseServiceError } from '@/lib/service-errors';

export type OrderStatus = 'AWAITING_CREDIT' | 'PENDING' | 'ACCEPTED' | 'PICKED_UP' | 'IN_PROGRESS' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED';

// Dates arrive as ISO strings.
export type Order = {
  id: string;
  orderDescription: string;
  requesterId: string;
  courierId: string | null;
  pickupLocationId: number;
  pickupName: string;
  pickupLat: number;
  pickupLon: number;
  deliveryLocationId: number;
  deliveryName: string;
  deliveryLat: number;
  deliveryLon: number;
  creditOffer: number;
  status: OrderStatus;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

export type ConfirmationKind = 'TIMING_CHANGE' | 'CANCELLATION' | 'COMPLETION';
export type Confirmation = {
  id: string;
  kind: ConfirmationKind;
  proposedBy: string;
  proposedWindowStart: string | null;
  proposedWindowEnd: string | null;
  requesterResponse: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  courierResponse: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';
  createdAt: string;
  resolvedAt: string | null;
};

export type HistoryEntry = {
  id: string;
  actorId: string | null;
  action: string;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus | null;
  changeDetails: unknown;
  occurredAt: string;
};

export type OrderList = 'available' | 'mine' | 'assigned';
export type Step = 'pick-up' | 'start-delivery' | 'arrive';
export type OrderInput = { orderDescription: string; pickupLocationId: number; deliveryLocationId: number; creditOffer: number;
  windowStart?: string; windowEnd?: string };
export type OrderEdit = Partial<Omit<OrderInput, 'creditOffer'>>;

export const POLL_MS = 10_000;
export const PAGE_SIZE = 20;

export const orderKeys = {
  all: ['orders'] as const,
  list: (list: OrderList, page: number) => ['orders', list, page] as const,
  everything: (list: 'mine' | 'assigned') => ['orders', list, 'all'] as const,
  order: (id: string) => ['order', id] as const,
  confirmations: (id: string) => ['confirmations', id] as const,
  history: (id: string) => ['order-history', id] as const,
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  AWAITING_CREDIT: 'Awaiting credit',
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  PICKED_UP: 'Picked up',
  IN_PROGRESS: 'In progress',
  ARRIVED: 'Arrived',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

// AI-generated (pending review by Deanson)
// Badge colours per status (Deanson, 2026-10-22): a soft background with darker text.
// AI-generated (pending review by Jie Yang): colours from the redesign palette.
const GRAY = { background: '#eceee9', text: '#5d6779' };
const GOLD = { background: '#fff4d6', text: '#8a5d00' };
const BLUE = { background: '#e9eeff', text: '#1a359b' };
const GREEN = { background: '#e6f5ec', text: '#17714a' };
const RED = { background: '#fff0ec', text: '#b8301d' };

export const STATUS_COLORS: Record<OrderStatus, { background: string; text: string }> = {
  AWAITING_CREDIT: GRAY,
  PENDING: GOLD,
  ACCEPTED: BLUE,
  PICKED_UP: BLUE,
  IN_PROGRESS: BLUE,
  ARRIVED: BLUE,
  COMPLETED: GREEN,
  CANCELLED: RED,
};

export const isActive = (order: Order) => order.status !== 'COMPLETED' && order.status !== 'CANCELLED';

/** An Order Service error, with the HTTP status and the service's error code. */
export class OrderError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string, readonly fields: FieldIssue[] = []) {
    super(message);
  }
}

export const isUnauthorized = (error: unknown) => error instanceof OrderError && error.status === 401;
export const isConflict = (error: unknown) => error instanceof OrderError && error.status === 409;

const BASE = '/api/session/orders';

// AI-generated (pending review by Deanson)
async function call<T>(path: string, fallback: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await withSessionMutation(() => fetch(`${BASE}${path}`, {
    method,
    cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  }));
  if (!response.ok) {
    const error = await parseServiceError(response, fallback);
    throw new OrderError(error.status, error.code, error.message, error.fields);
  }
  return response.json() as Promise<T>;
}

export function listOrders(list: OrderList, page: number): Promise<Page<Order>> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  return call(`/${list}?${query}`, 'Could not load orders.');
}

// AI-generated (pending review by Deanson)
const ALL_PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** Every order in the list: the API has no status filter, so the Orders page groups them itself. */
export async function listAllOrders(list: 'mine' | 'assigned'): Promise<Order[]> {
  const byId = new Map<string, Order>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(ALL_PAGE_SIZE) });
    const result = await call<Page<Order>>(`/${list}?${query}`, 'Could not load orders.');
    // Orders can shift between pages while this runs, so keep each one once.
    for (const order of result.items) if (!byId.has(order.id)) byId.set(order.id, order);
    if (result.items.length === 0 || page * ALL_PAGE_SIZE >= result.total) break;
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function groupOrders(orders: Order[]) {
  return {
    active: orders.filter(isActive),
    completed: orders.filter((order) => order.status === 'COMPLETED'),
    cancelled: orders.filter((order) => order.status === 'CANCELLED'),
  };
}

export const getOrder = (id: string) => call<Order>(`/${id}`, 'Could not load this order.');

export const getConfirmations = (id: string) =>
  call<{ items: Confirmation[] }>(`/${id}/confirmations`, 'Could not load proposals.').then((result) => result.items);

export const createOrder = (input: OrderInput) => call<Order>('', 'Could not create the order.', 'POST', input);

export const editOrder = (id: string, version: number, edit: OrderEdit) =>
  call<Order>(`/${id}`, 'Could not save the order.', 'PATCH', { version, ...edit });

export const acceptOrder = (id: string, version: number) =>
  call<Order>(`/${id}/accept`, 'Could not accept the order.', 'POST', { version });

export const cancelOrder = (id: string, version: number) =>
  call<Order>(`/${id}/cancel`, 'Could not cancel the order.', 'POST', { version });

export const advanceOrder = (id: string, step: Step, version: number) =>
  call<Order>(`/${id}/${step}`, 'Could not update the order.', 'POST', { version });

export const propose = (id: string, kind: 'CANCELLATION' | 'COMPLETION') =>
  call<Confirmation>(`/${id}/confirmations`, 'Could not send the proposal.', 'POST', { kind });

export const respond = (id: string, confirmationId: string, response: 'ACCEPTED' | 'REJECTED') =>
  call<Confirmation>(`/${id}/confirmations/${confirmationId}/respond`, 'Could not send your response.', 'POST', { response });

export const getHistory = (id: string) =>
  call<{ items: HistoryEntry[] }>(`/${id}/history`, 'Could not load the order history.').then((result) => result.items);

/** A text field of a history entry's changeDetails, such as a cancellation's `reason`. */
export function detailOf(entry: HistoryEntry, key: 'reason' | 'suspendedUserId'): string | null {
  const value = (entry.changeDetails as Record<string, unknown> | null)?.[key];
  return typeof value === 'string' ? value : null;
}

/** Whose suspension cancelled the order; null for entries saved before suspendedUserId was recorded. */
export function suspendedSide(entry: HistoryEntry, order: Order): 'requester' | 'courier' | null {
  const userId = detailOf(entry, 'suspendedUserId');
  return userId === null ? null : userId === order.requesterId ? 'requester' : userId === order.courierId ? 'courier' : null;
}

// AI-generated (reviewed by Zi Yi)
/** Why the order was cancelled, worded for the requester or courier looking at it. */
export function cancelledBecause(entry: HistoryEntry, order: Order, viewer: 'requester' | 'courier' | null): string | null {
  switch (detailOf(entry, 'reason')) {
    case 'USER_SUSPENDED': {
      const side = suspendedSide(entry, order);
      return side === null ? 'an account on this order has been suspended.'
        : side === viewer ? 'your account was suspended.' : `the ${side}'s account has been suspended.`;
    }
    case 'REQUESTER_CANCELLED': return viewer === 'requester' ? 'you cancelled it.' : 'the requester cancelled it.';
    case 'MUTUAL_CANCELLATION': return 'the requester and the courier agreed to cancel it.';
    case 'EXPIRED': return 'its delivery window ended before it was finished.';
    case 'SUPPLIER_DEACTIVATED': return 'its pickup or delivery location was deactivated.';
    case 'CREDIT_NOT_RESERVED': return viewer === 'requester' ? "your credits couldn't be reserved." : "the requester's credits couldn't be reserved.";
    default: return null;
  }
}

export function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
