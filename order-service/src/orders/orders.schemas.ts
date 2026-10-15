/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the Zod request schemas and response types for the Phase A read endpoints.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).

 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the create, edit and accept body schemas and the AWAITING_CREDIT status (Phase B).
 * Author review: Reviewed in full.
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

const LocationId = z.number().int().positive().max(2147483647);
const Timestamp = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const Version = z.number().int().positive();

/** Requester and status come from the token and the system, never the body. */
export const CreateOrderBody = z
  .object({
    orderDescription: z.string().trim().min(1),
    pickupLocationId: LocationId,
    deliveryLocationId: LocationId,
    creditOffer: z.number().int().min(1).max(2147483647),
    windowStart: Timestamp.optional(),
    windowEnd: Timestamp.optional(),
  })
  .strict();
export type CreateOrderBody = z.infer<typeof CreateOrderBody>;

/** Credit offer is not editable, so `.strict()` rejects it. */
export const EditOrderBody = z
  .object({
    version: Version,
    orderDescription: z.string().trim().min(1).optional(),
    pickupLocationId: LocationId.optional(),
    deliveryLocationId: LocationId.optional(),
    windowStart: Timestamp.optional(),
    windowEnd: Timestamp.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 1, 'Provide at least one field to change.');
export type EditOrderBody = z.infer<typeof EditOrderBody>;

export const VersionBody = z.object({ version: Version }).strict();
export type VersionBody = z.infer<typeof VersionBody>;

export type OrderStatus =
  | 'AWAITING_CREDIT' // created, Credit has not confirmed the hold yet
  | 'PENDING'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'IN_PROGRESS'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED';

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
