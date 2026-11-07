/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Added the admin dashboard's types, fetchers and React Query keys (docs/admin-dashboard-plan.md §8, #184).
Author review: Reviewed and tested locally by Zi Yi, 2026-11-07.
*/
import { useQuery } from '@tanstack/react-query';
import { withSessionMutation } from '@/lib/session-client';
import { parseServiceError } from '@/lib/service-errors';
import { detailOf, type HistoryEntry, type Order, OrderError, type OrderStatus, type Page, suspendedSide } from '@/lib/orders';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type LoginOutcome = 'SUCCESS' | 'WRONG_PASSWORD' | 'LOCKED' | 'SUSPENDED' | 'DEACTIVATED';

export type AdminUser = {
  userId: string;
  displayName: string;
  email: string;
  role: 'USER' | 'ADMIN';
  status: UserStatus;
  createdAt: string;
  suspensionReason: string | null;
  suspendedAt: string | null;
  deactivatedAt: string | null;
};

export type LoginSummary = {
  failedLast24h: number;
  lockedNow: number;
  flagged: { userId: string; displayName: string; status: UserStatus; failedCount: number; lastFailedAt: string }[];
  recentFailures: { userId: string; displayName: string; outcome: LoginOutcome; occurredAt: string }[];
};

export type LoginEvent = { outcome: LoginOutcome; occurredAt: string };

export type OrdersOverview = { live: { total: number; byState: Partial<Record<OrderStatus, number>> }; recentCancellations: Order[] };


export type Scope = 'live' | 'past';
export const SCOPES: Record<Scope, OrderStatus[]> = {
  live: ['PENDING', 'ACCEPTED', 'PICKED_UP', 'IN_PROGRESS', 'ARRIVED'],
  past: ['COMPLETED', 'CANCELLED'],
};
export type OrderFilter = { scope?: Scope; state?: OrderStatus; userId?: string; page: number };

export const ADMIN_POLL_MS = 15_000;
export const ADMIN_PAGE_SIZE = 20;
/** How long five wrong passwords lock an account: user-service LOGIN_LIMIT.blockSeconds (900). */
export const LOCK_MINUTES = 15;

export const adminKeys = {
  users: (status?: UserStatus) => ['admin', 'users', status ?? 'all'] as const,
  loginSummary: ['admin', 'login-summary'] as const,
  loginEvents: (userId: string, page: number) => ['admin', 'login-events', userId, page] as const,
  overview: ['admin', 'orders-overview'] as const,
  orders: (filter: OrderFilter) => ['admin', 'orders', filter] as const,
  history: (orderId: string) => ['admin', 'history', orderId] as const,
};

const BASE = '/api/session/admin';

// AI-generated (reviewed by Zi Yi)
// Throws OrderError so the query client's "don't retry a 4xx" rule applies here too.
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

const query = (values: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(values).flatMap(([key, value]) => value === undefined ? [] : [[key, String(value)]]));

export const listUsers = (status?: UserStatus) =>
  call<{ items: AdminUser[] }>(`/users?${query({ status })}`, 'Could not load users.').then((result) => result.items);

export const getLoginSummary = () => call<LoginSummary>('/users/login-summary', 'Could not load the login summary.');

export const listLoginEvents = (userId: string, page: number) =>
  call<Page<LoginEvent>>(`/users/${userId}/login-events?${query({ page, pageSize: ADMIN_PAGE_SIZE })}`, 'Could not load the login history.');

export const suspendUser = (userId: string, reason: string) =>
  call<AdminUser>(`/users/${userId}/suspend`, 'Could not suspend the account.', 'POST', { reason });

export const reactivateUser = (userId: string) =>
  call<AdminUser>(`/users/${userId}/reactivate`, 'Could not reactivate the account.', 'POST');

export const getOverview = () => call<OrdersOverview>('/orders/overview', 'Could not load the order overview.');

export const listAdminOrders = ({ scope, state, userId, page }: OrderFilter) =>
  call<Page<Order>>(`/orders?${query({ scope, state, userId, page, pageSize: ADMIN_PAGE_SIZE })}`, 'Could not load orders.');

export const getHistory = (orderId: string) =>
  call<{ items: HistoryEntry[] }>(`/orders/${orderId}/history`, 'Could not load the order timeline.').then((result) => result.items);

// AI-generated (reviewed by Zi Yi)
/** Every user, downloaded once and kept 60 s: orders carry ids only, and the user search needs names and emails. */
export function useUsers() {
  // ponytail: fine for hundreds of users; with tens of thousands add a server-side search and a fetch-one-user route.
  return useQuery({ queryKey: adminKeys.users(), queryFn: () => listUsers(), staleTime: 60_000 });
}

export function useUserNames(): (userId: string | null) => string {
  const users = useUsers();
  const names = new Map(users.data?.map((user) => [user.userId, user.displayName]));
  return (userId) => userId === null ? 'NA' : names.get(userId) ?? `${userId.slice(0, 8)}…`;
}

export const OUTCOME_LABEL: Record<LoginOutcome, string> = {
  SUCCESS: 'Success',
  WRONG_PASSWORD: 'Wrong password',
  LOCKED: 'Wrong password, locked',
  SUSPENDED: 'Refused: suspended',
  DEACTIVATED: 'Refused: deactivated',
};

/** Orders have no number of their own; the first 8 characters of the id, as the credit history shows them. */
export const orderNumber = (orderId: string) => `#${orderId.slice(0, 8).toUpperCase()}`;

const words = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');

// AI-generated (reviewed by Zi Yi)
// Plain-language names for order_history actions and the `reason` of a cancellation (plan §5).
const ACTION_LABEL: Record<string, string> = {
  CREATED: 'Requester placed the order',
  CREDIT_RESERVED: 'Credits reserved, waiting for a courier',
  EDITED: 'Requester edited the order',
  ACCEPTED: 'A courier accepted it',
  PICKED_UP: 'Courier picked it up',
  IN_PROGRESS: 'Courier started the delivery',
  ARRIVED: 'Courier arrived at the drop-off',
  COMPLETED: 'Both confirmed it was delivered',
  CANCELLED: 'Order cancelled',
};
export const actionLabel = (action: string) => ACTION_LABEL[action] ?? words(action);

const CANCEL_REASON: Record<string, string> = {
  REQUESTER_CANCELLED: 'The requester cancelled it before a courier accepted.',
  MUTUAL_CANCELLATION: 'The requester and the courier agreed to cancel it.',
  EXPIRED: 'Its delivery window ended before it was finished.',
  USER_SUSPENDED: 'An admin suspended the account of the requester or the courier.',
  CREDIT_NOT_RESERVED: 'The requester’s credits could not be reserved, usually because they did not have enough.',
};
/** A cancellation's reason in plain words, naming whose account a suspension was on when the entry says. */
export function cancelReason(entry: HistoryEntry, order: Order, name: (userId: string | null) => string): string | null {
  const reason = detailOf(entry, 'reason');
  const side = reason === 'USER_SUSPENDED' ? suspendedSide(entry, order) : null;
  if (side) return `An admin suspended the ${side}'s account (${name(detailOf(entry, 'suspendedUserId'))}).`;
  return reason === null ? null : CANCEL_REASON[reason] ?? words(reason);
}

export const USER_STATUS_COLORS: Record<UserStatus, { background: string; text: string }> = {
  ACTIVE: { background: '#e6f6ec', text: '#1d6b35' },
  SUSPENDED: { background: '#fdecea', text: '#b42318' },
  DEACTIVATED: { background: '#f1f3f6', text: '#4b5563' },
};
