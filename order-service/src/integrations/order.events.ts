/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Generated the order.events publisher (Phase D): plan §5 envelope plus data.status, with
 *        order_history as the outbox, as Zi Yi decided on 2026-10-18.
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-21
 * Scope: Listed USER_SUSPENDED among the OrderCancelled reasons.
 * Author review: Tested by Zi Yi (unit and compose.test.yaml integration tests), 2026-10-21.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Listed SUPPLIER_DEACTIVATED among the OrderCancelled reasons (issue #121).
 * Author review: Reviewed by Zi Yi, 2026-10-30.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Added OrderChangeRequest (outcome CREATED / APPROVED / REJECTED / EXPIRED) from
 *        order_confirmations (#186); shape chosen by Jie Yang, 2026-11-10, to confirm with Zi Yi.
 * Author review: pending — Jie Yang to record the review.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ChangeOutcome, OrdersRepository, Outgoing, Unpublished, UnpublishedChange } from '../orders/orders.repository';
import type { ConfirmationKind, OrderStatus } from '../orders/orders.schemas';
import { KafkaProducer } from './kafka.producer';

/** Order owns this topic and the event shape (root AGENTS.md §3 Messaging, rule 3). */
export const ORDER_EVENTS_TOPIC = 'order.events';

const EVENT_TYPES = {
  ACCEPTED: 'OrderAccepted',
  PICKED_UP: 'OrderPickedUp',
  IN_PROGRESS: 'OrderInProgress',
  ARRIVED: 'OrderArrived',
  COMPLETED: 'OrderCompleted',
  CANCELLED: 'OrderCancelled',
} as const satisfies Record<Unpublished['action'], string>;

/**
 * A proposal made or resolved (#186). The order's state doesn't change when a proposal is made, so
 * these come from order_confirmations, not history; data.outcome says what happened.
 */
export const CHANGE_EVENT_TYPE = 'OrderChangeRequest';

export interface OrderEvent {
  /** The history entry's ID, so a resend carries the same ID and Notification can drop it. */
  eventId: string;
  eventType: (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
  occurredAt: string;
  data: {
    orderId: string;
    requesterId: string;
    /** null for an order cancelled before anyone accepted it. */
    courierId: string | null;
    status: OrderStatus;
    /** OrderCancelled only: REQUESTER_CANCELLED, MUTUAL_CANCELLATION, EXPIRED, USER_SUSPENDED or SUPPLIER_DEACTIVATED. */
    reason?: string;
  };
}

/**
 * A proposal made or resolved (#186). `status` is the order's state when the event is published,
 * which may already be later than when the proposal was made.
 */
export interface OrderChangeEvent {
  /** The confirmation id for outcome CREATED, its resolution_event_id otherwise. */
  eventId: string;
  eventType: typeof CHANGE_EVENT_TYPE;
  occurredAt: string;
  data: {
    orderId: string;
    requesterId: string;
    courierId: string | null;
    status: OrderStatus;
    outcome: ChangeOutcome;
    confirmationId: string;
    kind: ConfirmationKind;
    proposedBy: string;
    /** TIMING_CHANGE only. */
    proposedWindowStart?: string;
    proposedWindowEnd?: string;
  };
}

export function toEvent(entry: Unpublished): OrderEvent;
export function toEvent(entry: UnpublishedChange): OrderChangeEvent;
export function toEvent(entry: Outgoing): OrderEvent | OrderChangeEvent;
export function toEvent(entry: Outgoing): OrderEvent | OrderChangeEvent {
  if (entry.source !== 'HISTORY') {
    const window =
      entry.kind === 'TIMING_CHANGE' && entry.proposedWindowStart && entry.proposedWindowEnd
        ? { proposedWindowStart: entry.proposedWindowStart.toISOString(), proposedWindowEnd: entry.proposedWindowEnd.toISOString() }
        : {};
    return {
      eventId: entry.id,
      eventType: CHANGE_EVENT_TYPE,
      occurredAt: entry.occurredAt.toISOString(),
      data: {
        orderId: entry.orderId,
        requesterId: entry.requesterId,
        courierId: entry.courierId,
        status: entry.status,
        outcome: entry.source,
        confirmationId: entry.confirmationId,
        kind: entry.kind,
        proposedBy: entry.proposedBy,
        ...window,
      },
    };
  }
  const reason = entry.action === 'CANCELLED' ? entry.changeDetails?.reason : undefined;
  return {
    eventId: entry.id,
    eventType: EVENT_TYPES[entry.action],
    occurredAt: entry.occurredAt.toISOString(),
    data: {
      orderId: entry.orderId,
      requesterId: entry.requesterId,
      courierId: entry.courierId,
      status: entry.newStatus,
      ...(reason ? { reason } : {}),
    },
  };
}

const logger = new Logger('Order');

/**
 * Background job (main.ts runs it every second): publishes each state change's history entry, and
 * each proposal made or resolved (#186), to order.events, keyed by orderId, and marks it once Kafka
 * has stored it. The history or confirmation row is written in the same transaction as the change, so no event is lost if Kafka is down; a crash
 * before the mark resends it with the same eventId. Stops at the first failure, so one order's
 * events never go out of order.
 */
@Injectable()
export class OrderEvents {
  constructor(
    private readonly kafka: KafkaProducer,
    private readonly orders: OrdersRepository,
  ) {}

  async publishPending(): Promise<void> {
    let eventId: string | undefined;
    try {
      for (const entry of await this.orders.unpublished()) {
        eventId = entry.id;
        await this.kafka.send(ORDER_EVENTS_TOPIC, entry.orderId, toEvent(entry));
        await this.orders.markPublished(entry);
      }
    } catch {
      logger.warn(JSON.stringify({ event: 'ORDER_EVENT_PUBLISH_FAILED', eventId: eventId ?? null }));
    }
  }
}
