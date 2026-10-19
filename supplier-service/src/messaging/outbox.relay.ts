/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the outbox relay that sends saved events to Kafka (issue #120; relay design
 *        approved by Jie Yang).
 * Author review: pending — Jie Yang to record what he checked.
 */
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { config } from '../config';
import { PG_POOL } from '../db/database';
import { PUBLISHER, Publisher } from './publisher';

interface OutboxRow {
  event_id: string;
  topic: string;
  msg_key: string;
  payload: unknown;
}

/** How many events one pass claims at a time. */
const BATCH_SIZE = 100;

/**
 * Sends the events in supplier_outbox to Kafka, oldest first, and marks each one sent. A send that
 * fails leaves the event (and every later one) for the next pass, so a Kafka outage delays events
 * but never loses or reorders them. Delivery is at least once: a crash between the send and the
 * mark sends the event again, so consumers dedupe on `eventId` (root AGENTS.md §3, rule 1).
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('OutboxRelay');
  private timer?: NodeJS.Timeout;
  private running?: Promise<number>;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(PUBLISHER) private readonly publisher: Publisher | null,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.publisher) {
      this.logger.warn(
        'SUPPLIER_KAFKA_BROKERS is not set: events are saved in supplier_outbox but not sent until it is.',
      );
      return;
    }
    this.timer = setInterval(() => void this.publishPending(), config.outboxPollMs);
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  /** Sends every pending event; returns how many were sent. Passes never overlap. */
  publishPending(): Promise<number> {
    this.running ??= this.drain().finally(() => (this.running = undefined));
    return this.running;
  }

  private async drain(): Promise<number> {
    let sent = 0;
    for (;;) {
      const batch = await this.sendBatch();
      sent += batch.sent;
      if (batch.failed || batch.sent < BATCH_SIZE) return sent;
    }
  }

  private async sendBatch(): Promise<{ sent: number; failed: boolean }> {
    if (!this.publisher) return { sent: 0, failed: false };
    const client = await this.pool.connect();
    let sent = 0;
    let failed = false;
    try {
      await client.query('BEGIN');
      // SKIP LOCKED: a second replica takes other rows instead of sending these twice.
      const { rows } = await client.query<OutboxRow>(
        `SELECT event_id, topic, msg_key, payload FROM supplier_outbox
          WHERE published_at IS NULL ORDER BY created_at, event_id
          LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [BATCH_SIZE],
      );
      for (const row of rows) {
        try {
          await this.publisher.send({ topic: row.topic, key: row.msg_key, value: JSON.stringify(row.payload) });
        } catch (err) {
          // Stop here so later events for the same location never overtake this one.
          this.logger.warn(`Could not send event ${row.event_id} to ${row.topic}; will retry: ${(err as Error).message}`);
          failed = true;
          break;
        }
        await client.query('UPDATE supplier_outbox SET published_at = now() WHERE event_id = $1', [row.event_id]);
        sent++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      this.logger.error(`Outbox pass failed: ${(err as Error).message}`);
      return { sent: 0, failed: true };
    } finally {
      client.release();
    }
    return { sent, failed };
  }
}
