/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Generated the order.events publisher (Phase D): plan §5 envelope plus data.status, with
 *        order_history as the outbox, as Zi Yi decided on 2026-10-18.
 * Author review: Reviewed
 */
import { Injectable, Logger } from '@nestjs/common';
import { OrdersRepository, Unpublished } from '../orders/orders.repository';
import type { OrderStatus } from '../orders/orders.schemas';
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
    /** OrderCancelled only: REQUESTER_CANCELLED, MUTUAL_CANCELLATION or EXPIRED. */
    reason?: string;
  };
}

export function toEvent(entry: Unpublished): OrderEvent {
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
 * Background job (main.ts runs it every second): publishes each state change's history entry to
 * order.events, keyed by orderId, and marks it once Kafka has stored it. The history row is
 * written in the same transaction as the change, so no event is lost if Kafka is down; a crash
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
        await this.orders.markPublished(entry.id);
      }
    } catch {
      logger.warn(JSON.stringify({ event: 'ORDER_EVENT_PUBLISH_FAILED', eventId: eventId ?? null }));
    }
  }
}
