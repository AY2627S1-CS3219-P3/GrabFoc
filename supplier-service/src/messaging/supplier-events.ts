/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the SupplierDeactivated event and the outbox insert (issue #120; contract and
 *        outbox design from the issue, approved by Jie Yang).
 * Author review: pending — Jie Yang to record what he checked.
 */
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';

/** Supplier's own events topic (root AGENTS.md §3 Messaging, rule 3). */
export const SUPPLIER_EVENTS_TOPIC = 'supplier.events';

export interface SupplierDeactivated {
  eventId: string;
  eventType: 'SupplierDeactivated';
  occurredAt: string;
  /** `locationId` is `locations.id`; there is no separate supplier-account id. */
  data: { locationId: number };
}

export function supplierDeactivated(locationId: number, now: Date = new Date()): SupplierDeactivated {
  return {
    eventId: randomUUID(),
    eventType: 'SupplierDeactivated',
    occurredAt: now.toISOString(),
    data: { locationId },
  };
}

/**
 * Queues the event in supplier_outbox, keyed by the location id. Call it inside the transaction
 * that makes the change, so the event is saved if and only if the change is; the OutboxRelay
 * sends it to Kafka afterwards.
 */
export async function enqueue(db: Pool | PoolClient, event: SupplierDeactivated): Promise<void> {
  await db.query('INSERT INTO supplier_outbox (event_id, topic, msg_key, payload) VALUES ($1, $2, $3, $4)', [
    event.eventId,
    SUPPLIER_EVENTS_TOPIC,
    String(event.data.locationId),
    JSON.stringify(event),
  ]);
}
