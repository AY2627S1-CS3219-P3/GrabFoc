/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the outbox relay from Deanson's design: setTimeout loop, claim with SKIP LOCKED,
 *   one batched send, mark published, exponential backoff, failure reporting for the future
 *   logging service, and a finally that always schedules the next tick.
 * Author review: pending — Deanson to record what he checked.
 */
// AI-generated (reviewed by Deanson)
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditEvent, auditLine } from '../../common/logging/logger';
import type { AppConfig } from '../../config/env.validation';
import { DatabaseService } from '../database/database.service';
import { KafkaProducer } from '../kafka/kafka.producer';
import { OutboxRepository, PendingEvent } from './outbox.repository';

/** Events sent per tick. */
const BATCH_SIZE = 50;
/** Past this age, a pending event raises OUTBOX_BACKLOG_STALE: the relay is stuck, not just slow. */
const STALE_AFTER_MS = 60_000;

export interface RelayFailure {
  eventIds: string[];
  error: unknown;
  /** Age of the oldest event in the failed batch; null when the batch was never read. */
  oldestPendingAgeMs: number | null;
}

/**
 * Publishes outbox events to Kafka. Delivery is at least once: an event is sent first and marked
 * published second, so a crash in between sends it again. Consumers must be idempotent
 * (user-service/AGENTS.md, "Events").
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('OutboxRelay');
  private readonly pollMs: number;
  private readonly maxBackoffMs: number;
  private delayMs: number;
  private timer?: NodeJS.Timeout;
  private current?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxRepository,
    private readonly producer: KafkaProducer,
    config: ConfigService<AppConfig, true>,
  ) {
    ({ pollMs: this.pollMs, maxBackoffMs: this.maxBackoffMs } = config.get('outbox', { infer: true }));
    this.delayMs = this.pollMs;
  }

  /** After every onModuleInit, so the migrations have run. */
  onApplicationBootstrap(): void {
    this.schedule(0);
  }

  /**
   * Stops the loop and waits for the tick in progress. DatabaseLifecycle may close the pool at
   * the same time; pool.end() waits for a checked-out client, so that tick still finishes.
   */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.timer);
    await this.current;
    await this.producer.reset();
  }

  /** The delay before the next tick; exposed for tests. */
  get nextDelayMs(): number {
    return this.delayMs;
  }

  /**
   * One pass over the outbox. Never throws: every error, from Kafka or the database, is
   * reported and backed off, and `finally` always schedules the next tick, so the loop cannot
   * stop silently.
   */
  async tick(): Promise<void> {
    let batch: PendingEvent[] = [];
    try {
      await this.db.transaction(async (tx) => {
        batch = await this.outbox.claimPending(tx, BATCH_SIZE);
        // Nothing to send: no Kafka connection, so an idle relay stays quiet while Kafka is down.
        if (batch.length === 0) return;
        // If this fails partway, some messages may already be in Kafka. The rollback marks none
        // of them, so the whole batch is sent again: safe, because consumers are idempotent.
        await this.producer.sendBatch(batch);
        await this.outbox.markPublished(
          batch.map((event) => event.id),
          tx,
        );
      });
      this.delayMs = this.pollMs;
    } catch (error) {
      this.delayMs = Math.min(this.delayMs * 2, this.maxBackoffMs);
      // A shutdown closing the pool under a tick is not a failure worth reporting.
      if (!this.stopping) {
        this.reportRelayFailure({
          eventIds: batch.map((event) => event.id),
          error,
          oldestPendingAgeMs: batch[0] ? Date.now() - batch[0].createdAt.getTime() : null,
        });
      }
      await this.producer.reset();
    } finally {
      this.schedule(this.delayMs);
    }
  }

  /**
   * The one place relay failures are reported. The outbox keeps no failure columns, so these
   * lines are the only history of what failed and why. Ids and the error message only.
   */
  reportRelayFailure({ eventIds, error, oldestPendingAgeMs }: RelayFailure): void {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const failure = { eventIds, error: message, oldestPendingAgeMs, nextRetryMs: this.delayMs };
    this.logger.error(auditLine(AuditEvent.OUTBOX_RELAY_FAILED, failure));
    if (oldestPendingAgeMs !== null && oldestPendingAgeMs > STALE_AFTER_MS) {
      this.logger.warn(auditLine(AuditEvent.OUTBOX_BACKLOG_STALE, { oldestPendingAgeMs }));
    }
    // TODO(logging-service): push `failure` to the centralized logging service here, best effort:
    // never await it in a way that can throw, so a logging outage never stops the relay.
  }

  private schedule(ms: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.current = this.tick();
    }, ms);
  }
}
