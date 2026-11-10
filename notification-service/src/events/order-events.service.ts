/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the order event handling (#152): deduplication, the stale check and the
 *        recipient rows, in one transaction, as agreed in #148.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Comments now point at SenderService (#153).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Handled OrderChangeRequest (#186): recorded with its proposal columns, never moves the
 *        order's last state, and is stale once the order has moved on or finished.
 * Author review: pending — Jie Yang to record the review.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/database';
import { OrderEvent } from '../messaging/messages';
import { changeRecipients, Recipient, recipientsFor } from './recipients';

/**
 * What happened to an event:
 * - DUPLICATE: its event id was seen before; nothing changed.
 * - DISCARDED_STALE: an earlier state than the last one handled, or after a final state. For an
 *   OrderChangeRequest: the order has since moved to a later state, or has finished.
 * - DISCARDED_NO_AUDIENCE: a state nobody is emailed about (PENDING), or a proposal outcome
 *   nobody is emailed about (an approved completion or cancellation).
 * - QUEUED: recipient rows were created; SenderService sends them next.
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
              (event_id, event_type, order_id, requester_id, courier_id, status, reason, occurred_at, outcome,
               change_outcome, change_kind, proposed_by, proposed_window_start, proposed_window_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PROCESSING', $9, $10, $11, $12, $13)
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
        event.change?.outcome ?? null,
        event.change?.kind ?? null,
        event.change?.proposedBy ?? null,
        event.change?.proposedWindowStart ?? null,
        event.change?.proposedWindowEnd ?? null,
      ],
    );
    if (inserted.rowCount === 0) return 'DUPLICATE';

    let recipients: Recipient[];
    if (event.change) {
      // A proposal doesn't change the order's state, so it never moves notification_order_states.
      // It is stale once the order has finished or been handled in a later state than the one it
      // was published with: a later email already says more (#186).
      const moved = await client.query(
        `SELECT 1 FROM notification_order_states
          WHERE order_id = $1 AND order_status_rank(last_status) > order_status_rank($2::order_status)`,
        [event.orderId, event.status],
      );
      if (moved.rowCount !== 0 || event.status === 'COMPLETED' || event.status === 'CANCELLED') {
        return this.finish(client, event.eventId, 'DISCARDED_STALE');
      }
      recipients = changeRecipients(event.change, event.requesterId, event.courierId);
      if (recipients.length === 0) return this.finish(client, event.eventId, 'DISCARDED_NO_AUDIENCE');
      return this.queue(client, event.eventId, recipients);
    }

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

    recipients = recipientsFor(event.status, event.requesterId, event.courierId);
    if (recipients.length === 0) return this.finish(client, event.eventId, 'DISCARDED_NO_AUDIENCE');
    return this.queue(client, event.eventId, recipients);
  }

  private async queue(client: PoolClient, eventId: string, recipients: Recipient[]): Promise<EventOutcome> {
    for (const recipient of recipients) {
      await client.query(
        `INSERT INTO notifications (event_id, role, recipient_id) VALUES ($1, $2, $3)
         ON CONFLICT (event_id, role) DO NOTHING`,
        [eventId, recipient.role, recipient.userId],
      );
    }
    // The event stays PROCESSING until SenderService has saved every email's result.
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
