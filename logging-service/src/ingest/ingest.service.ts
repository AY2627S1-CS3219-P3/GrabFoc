/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the ingest path: validate a message, store it, and count stored, duplicate and
 *        rejected lines. Follows the plan Cole Lin approved on 2026-10-16.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Split a permanently unstorable line from a temporary store failure, so a line the
 *        database will never accept cannot be redelivered forever (the team's Kafka rules,
 *        root AGENTS.md §3, landed while this was being written).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Send a line this service cannot store to the dead-letter topic as well as counting it
 *        (Kafka rule 6, at Cole Lin's direction).
 * Author review: Cole Lin, read and approved.
 */
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { config } from '../config';
import { inboundLineSchema, toRow } from '../lines/line.schema';
import { LinesService } from '../lines/lines.service';
import { DEAD_LETTERS, DeadLetters, InboundMessage, LINE_CONSUMER, LineConsumer } from './consumer';

// AI-generated (reviewed by Cole Lin).

@Injectable()
export class IngestService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Ingest');
  readonly counts = { stored: 0, duplicate: 0, rejected: 0, failed: 0, deadLettered: 0 };

  constructor(
    private readonly lines: LinesService,
    @Optional() @Inject(LINE_CONSUMER) private readonly consumer?: LineConsumer,
    @Optional() @Inject(DEAD_LETTERS) private readonly deadLetters?: DeadLetters,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!config.kafkaBrokers.length) {
      // The query API still works. A service with no broker configured logs to stdout only, so
      // there is nothing to consume and this is a normal way to run, not a failure.
      this.logger.log('LOGGING_KAFKA_BROKERS is not set: ingest is off, the query API is up.');
      return;
    }
    if (!this.consumer) {
      this.logger.warn(
        `LOGGING_KAFKA_BROKERS is set but no consumer is wired in yet (see #75, the shared Kafka ` +
          `broker). Lines produced to "${config.kafkaTopic}" will wait in the topic until it is.`,
      );
      return;
    }
    await this.consumer.start((message) => this.handle(message));
    this.logger.log(`Consuming "${config.kafkaTopic}" as "${config.kafkaGroupId}"`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.stop();
  }

  /**
   * Stores one message. Never throws: a message this cannot parse must not stop the consumer, or
   * one malformed line from one service blocks every other service's logging.
   */
  async handle(message: InboundMessage): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.value);
    } catch {
      await this.reject(message, 'not valid JSON');
      return;
    }

    const result = inboundLineSchema.safeParse(parsed);
    if (!result.success) {
      await this.reject(
        message,
        result.error.issues
          .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
          .join('; '),
      );
      return;
    }

    try {
      const stored = await this.lines.insert(toRow(result.data));
      if (stored) this.counts.stored += 1;
      else this.counts.duplicate += 1;
    } catch (err) {
      const permanent = unstorable(err);
      if (permanent) {
        // The database will never accept this line, so redelivering it would loop on the same
        // message forever and hold up every other service's logging behind it. Park it instead.
        await this.reject(message, `the store rejected it (SQLSTATE ${permanent})`);
        return;
      }
      // A connection failure is ours, not the message's, and it passes: let the broker redeliver.
      this.counts.failed += 1;
      this.logger.error(
        JSON.stringify({ event: 'line_store_failed', lineId: result.data.lineId, service: result.data.service }),
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  }

  /**
   * Records that a line was dropped, without the line. The payload is what failed validation, so
   * it is exactly the thing that might carry something that should never have been sent; the
   * topic, partition and offset are enough to find it in the broker.
   */
  private async reject(message: InboundMessage, reason: string): Promise<void> {
    this.counts.rejected += 1;
    let deadLettered = false;
    if (this.deadLetters) {
      try {
        await this.deadLetters.send(message, reason);
        this.counts.deadLettered += 1;
        deadLettered = true;
      } catch (err) {
        // A dead letter that cannot be parked must not stop the consumer: the line is still on its
        // producer's stdout, and stopping here would hold up every other service's logging.
        this.logger.error(
          JSON.stringify({ event: 'dead_letter_failed', topic: message.topic ?? null, offset: message.offset ?? null }),
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    this.logger.warn(
      JSON.stringify({
        event: 'line_rejected',
        reason,
        deadLettered,
        topic: message.topic ?? null,
        partition: message.partition ?? null,
        offset: message.offset ?? null,
      }),
    );
  }
}

/**
 * The SQLSTATE of a failure the line itself caused, or undefined when the failure was ours.
 * Class 22 is a data exception (a value too long for its column, say) and class 23 an integrity
 * constraint violation: both mean this exact line can never be stored, however often it is
 * redelivered. Everything else — a dropped connection, a shut-down server, too many clients — is
 * temporary and worth retrying.
 */
function unstorable(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && (code.startsWith('22') || code.startsWith('23')) ? code : undefined;
}
