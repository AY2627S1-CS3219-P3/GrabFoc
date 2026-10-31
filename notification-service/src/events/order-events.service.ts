/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the order event handling (#152): deduplication, the stale check and the
 *        recipient rows, in one transaction, as agreed in #148.
 * Author review: pending — Jie Yang to record the review.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/database';
import { OrderEvent } from '../messaging/messages';
import { recipientsFor } from './recipients';

/**
 * What happened to an event:
 * - DUPLICATE: its event id was seen before; nothing changed.
 * - DISCARDED_STALE: an earlier state than the last one handled, or after a final state.
 * - DISCARDED_NO_AUDIENCE: a state nobody is emailed about (PENDING).
 * - QUEUED: recipient rows were created, waiting to be sent (#153).
 */
export type EventOutcome = 'DUPLICATE' | 'DISCARDED_STALE' | 'DISCARDED_NO_AUDIENCE' | 'QUEUED';

@Injectable()
export class OrderEventsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Records one event. Everything happens in one transaction, so a crash part-way leaves no trace
   * and the redelivered message is handled from the start.
   */
  async handle(event: OrderEvent): Promise<EventOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const outcome = await this.handleIn(client, event);
      await client.query('COMMIT');
      return outcome;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async handleIn(client: PoolClient, event: OrderEvent): Promise<EventOutcome> {
    const inserted = await client.query(
      `INSERT INTO notification_events
              (event_id, event_type, order_id, requester_id, courier_id, status, reason, occurred_at, outcome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PROCESSING')
       ON CONFLICT (event_id) DO NOTHING`,
      [
        event.eventId,
        event.eventType,
        event.orderId,
        event.requesterId,
        event.courierId,
        event.status,
        event.reason,
        event.occurredAt,
      ],
    );
    if (inserted.rowCount === 0) return 'DUPLICATE';

    // No row back means the event is stale: its state is earlier than the last one handled, or
    // the order already reached a final state (#148).
    const current = await client.query(
      `INSERT INTO notification_order_states AS s (order_id, last_status, last_event_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (order_id) DO UPDATE
         SET last_status = EXCLUDED.last_status, last_event_id = EXCLUDED.last_event_id, updated_at = now()
         WHERE order_status_rank(s.last_status) < 6
           AND order_status_rank(EXCLUDED.last_status) >= order_status_rank(s.last_status)
       RETURNING order_id`,
      [event.orderId, event.status, event.eventId],
    );
    if (current.rowCount === 0) return this.finish(client, event.eventId, 'DISCARDED_STALE');

    const recipients = recipientsFor(event.status, event.requesterId, event.courierId);
    if (recipients.length === 0) return this.finish(client, event.eventId, 'DISCARDED_NO_AUDIENCE');

    for (const recipient of recipients) {
      await client.query(
        `INSERT INTO notifications (event_id, role, recipient_id) VALUES ($1, $2, $3)
         ON CONFLICT (event_id, role) DO NOTHING`,
        [event.eventId, recipient.role, recipient.userId],
      );
    }
    // The event stays PROCESSING until its emails are sent (#153).
    return 'QUEUED';
  }

  private async finish(
    client: PoolClient,
    eventId: string,
    outcome: 'DISCARDED_STALE' | 'DISCARDED_NO_AUDIENCE',
  ): Promise<EventOutcome> {
    await client.query(`UPDATE notification_events SET outcome = $2, handled_at = now() WHERE event_id = $1`, [
      eventId,
      outcome,
    ]);
    return outcome;
  }
}
