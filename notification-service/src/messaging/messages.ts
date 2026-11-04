/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the message types, headers and the order.events parser (#152), following
 *        credit-service/src/messaging/messages.ts. The event shape is Order's
 *        (order-service/src/integrations/order.events.ts).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added the x-due-at header for retry topics (#154).
 * Author review: pending — Jie Yang to record the review.
 */
import { z } from 'zod';

/** A message as Notification sees it, whichever Kafka client delivered it. */
export interface InboundMessage {
  topic: string;
  /** Where the message sits in its topic; together with the topic, its permanent identity. */
  partition?: number;
  offset?: string;
  key: string | null;
  value: Buffer | null;
  headers: Record<string, string>;
}

export interface OutboundMessage {
  topic: string;
  key: string | null;
  /** Raw bytes are passed through untouched, so a dead letter keeps exactly what failed. */
  value: Buffer | string;
  headers: Record<string, string>;
}

export interface Publisher {
  send(message: OutboundMessage): Promise<void>;
}

/** Headers Notification adds to messages it retries or dead-letters; the same names as Credit's. */
export const HEADER = {
  /** How many times the message has failed so far. */
  attempt: 'x-attempt',
  error: 'x-error',
  errorCode: 'x-error-code',
  /** The topic the message originally came from. */
  sourceTopic: 'x-source-topic',
  /** Where the original message sat in its source topic, so a redelivered dead letter is one row. */
  sourcePartition: 'x-source-partition',
  sourceOffset: 'x-source-offset',
  deadLetteredAt: 'x-dead-lettered-at',
  /** On a retry topic: when the message may be handled, in epoch milliseconds. */
  dueAt: 'x-due-at',
} as const;

/** A message that can never be handled, however often it is retried. */
export class InvalidMessageError extends Error {}

export const ORDER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PICKED_UP',
  'IN_PROGRESS',
  'ARRIVED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const uuid = z.string().uuid();
// PostgreSQL returns UUIDs in lower case; lower-casing keeps a repeated event equal to the stored one.
const id = uuid.transform((v) => v.toLowerCase());

// The Order Service owns order.events (root AGENTS.md §3 Messaging, rule 3), so fields Notification
// doesn't use are ignored rather than rejected, as Credit does with user.events.
const orderEventSchema = z.object({
  eventId: id,
  eventType: z.string().min(1).max(64),
  occurredAt: z.string().datetime({ offset: true }),
  data: z.object({
    orderId: id,
    requesterId: id,
    courierId: id.nullable(),
    status: z.enum(ORDER_STATUSES),
    reason: z.string().max(64).optional(),
  }),
});

export interface OrderEvent {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  orderId: string;
  requesterId: string;
  courierId: string | null;
  status: OrderStatus;
  reason: string | null;
}

function parseJson(value: Buffer | null): unknown {
  if (!value) throw new InvalidMessageError('The message has no value.');
  try {
    return JSON.parse(value.toString('utf8'));
  } catch {
    throw new InvalidMessageError('The message is not valid JSON.');
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

export function parseOrderEvent(value: Buffer | null): OrderEvent {
  const result = orderEventSchema.safeParse(parseJson(value));
  if (!result.success) throw new InvalidMessageError(`Invalid order event: ${describeIssues(result.error)}`);
  const { eventId, eventType, occurredAt, data } = result.data;
  return {
    eventId,
    eventType,
    occurredAt: new Date(occurredAt),
    orderId: data.orderId,
    requesterId: data.requesterId,
    courierId: data.courierId,
    status: data.status,
    reason: data.reason ?? null,
  };
}

/** Best-effort ids for logs and the dead-letter table; nulls when the message can't be read. */
export function peekIds(value: Buffer | null): { eventId: string | null; orderId: string | null; type: string | null } {
  let json: unknown;
  try {
    json = parseJson(value);
  } catch {
    return { eventId: null, orderId: null, type: null };
  }
  const asObject = (v: unknown) => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
  const fields = asObject(json);
  const id = (v: unknown) => (uuid.safeParse(v).success ? (v as string).toLowerCase() : null);
  return {
    eventId: id(fields.eventId),
    orderId: id(asObject(fields.data).orderId),
    type: typeof fields.eventType === 'string' ? fields.eventType.slice(0, 64) : null,
  };
}
