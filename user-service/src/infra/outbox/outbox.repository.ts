/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the outbox queries (add, claim with SKIP LOCKED, mark published) from Deanson's design.
 * Author review: pending — Deanson to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-20
 * Scope: Updated the claim-order comment for UserSuspended (#72).
 * Author review: pending — Zi Yi to review.
 */
// AI-generated (reviewed by Deanson)
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';

/** An event to publish, written in the same transaction as the change it describes. */
export interface OutboxEvent {
  /** Also the event's eventId. */
  id: string;
  /** The entity the event is about; used as the Kafka key so its events stay in order. */
  aggregateId: string;
  eventType: string;
  topic: string;
  payload: Record<string, unknown>;
}

export interface PendingEvent extends OutboxEvent {
  createdAt: Date;
}

interface OutboxRow {
  id: string;
  aggregate_id: string;
  event_type: string;
  topic: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

@Injectable()
export class OutboxRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Always inside the caller's transaction, so the event exists exactly when the change does. */
  async add(event: OutboxEvent, tx: PoolClient): Promise<void> {
    await this.db.query(
      `INSERT INTO outbox (id, aggregate_id, event_type, topic, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [event.id, event.aggregateId, event.eventType, event.topic, JSON.stringify(event.payload)],
      tx,
    );
  }

  /**
   * Locks the oldest pending events until `tx` ends. SKIP LOCKED means a second relay (another
   * replica) skips them instead of waiting, so no event is claimed twice at once.
   *
   * created_at is the time the writing transaction *started*, not when it committed, so a slow
   * transaction can commit a row older than one already sent. Harmless for UserRegistered and
   * UserSuspended: only an ACTIVE account can be suspended, so that transaction always starts
   * after the UserRegistered one committed (user-service/AGENTS.md, "Events").
   */
  async claimPending(tx: PoolClient, limit: number): Promise<PendingEvent[]> {
    const { rows } = await this.db.query<OutboxRow>(
      `SELECT id, aggregate_id, event_type, topic, payload, created_at
       FROM outbox
       WHERE published_at IS NULL
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit],
      tx,
    );
    return rows.map((row) => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      topic: row.topic,
      payload: row.payload,
      createdAt: row.created_at,
    }));
  }

  async markPublished(ids: string[], tx: PoolClient): Promise<void> {
    await this.db.query('UPDATE outbox SET published_at = now() WHERE id = ANY($1::uuid[])', [ids], tx);
  }
}
