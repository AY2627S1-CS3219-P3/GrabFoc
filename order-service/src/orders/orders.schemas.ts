/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the Zod request schemas and response types for the Phase A read endpoints.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import { z } from 'zod';

export const OrderIdParam = z.string().uuid();

/** Same paging parameters and defaults as the Supplier Service listing. */
export const PageQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type PageQuery = z.infer<typeof PageQuery>;

export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PICKED_UP' | 'IN_PROGRESS' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED';

export interface Order {
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
  windowStart: Date;
  windowEnd: Date;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface HistoryEntry {
  id: string;
  actorId: string | null;
  action: string;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus | null;
  changeDetails: unknown;
  occurredAt: Date;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
