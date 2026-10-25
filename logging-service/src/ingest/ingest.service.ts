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
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: After the PR #129 reviews: redact a dead-letter body instead of parking raw bytes, and
 *        let a failed park be redelivered rather than committing the offset anyway.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Build a rejection reason from the field and the rule that failed, never from Zod's
 *        message, which quotes the value it received (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { config } from '../config';
import { inboundLineSchema, redactDeep, toRow } from '../lines/line.schema';
import { LinesService } from '../lines/lines.service';
import { DEAD_LETTERS, DeadLetters, InboundMessage, LINE_CONSUMER, LineConsumer } from './consumer';

// AI-generated (reviewed by Cole Lin).

@Injectable()
export class IngestService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Ingest');
  readonly counts = { stored: 0, duplicate: 0, rejected: 0, failed: 0, deadLettered: 0, deadLetterFailed: 0 };

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
      // No body: bytes that are not JSON cannot be inspected field by field, so there is no way to
      // know whether they hold a password. The raw message stays in the source topic for Kafka's
      // retention, which is where to look if the headers are not enough (PR #129 review).
      await this.reject(message, 'not valid JSON', null);
      return;
    }

    const result = inboundLineSchema.safeParse(parsed);
    if (!result.success) {
      await this.reject(
        message,
        result.error.issues
          // The field and the rule it broke, not Zod's message: that quotes the value it saw, so
          // `role: "Bearer eyJ..."` would put a token in the rejection line and in the dead-letter
          // header, both of which sit outside the body's redaction (PR #129 review).
          .map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.code}`)
          .join('; '),
        // Field names and value types only, never a value. A line that failed validation failed
        // because some field held something unexpected, and that something can be a credential
        // in a field redaction does not know by name - role: "Bearer eyJ..." (PR #129 review).
        shapeOf(parsed),
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
        await this.reject(message, `the store rejected it (SQLSTATE ${permanent})`, safeBody(result.data));
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
  private async reject(message: InboundMessage, reason: string, body: string | null): Promise<void> {
    this.counts.rejected += 1;
    this.logger.warn(
      JSON.stringify({
        event: 'line_rejected',
        reason,
        parked: Boolean(this.deadLetters),
        topic: message.topic ?? null,
        partition: message.partition ?? null,
        offset: message.offset ?? null,
      }),
    );
    if (!this.deadLetters) return;
    try {
      await this.deadLetters.send(message, reason, body);
      this.counts.deadLettered += 1;
    } catch (err) {
      // Rethrown, so the offset is not committed and the broker redelivers: swallowing this would
      // leave the line neither stored nor parked, which is the one outcome worth avoiding
      // (PR #129 review). A park fails because the broker is unreachable, and then the consumer is
      // not making progress anyway.
      this.counts.deadLetterFailed += 1;
      this.logger.error(
        JSON.stringify({ event: 'dead_letter_failed', topic: message.topic ?? null, offset: message.offset ?? null }),
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
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

/**
 * A dead-letter body with sensitive field names replaced, or null when it cannot be built. Parked
 * messages are as readable as the store itself, so the same redaction applies; `JSON.stringify`
 * can still fail on a value JSON refuses, and a dead letter is not worth an exception.
 */
const SHAPE_MAX_KEYS = 40;
const SHAPE_MAX_DEPTH = 4;

/**
 * The *shape* of a payload: field names and value types, never a value.
 *
 * Name-based redaction is the right tool for a line that validated, because its fields are the
 * ones the envelope defines. A line that failed validation failed precisely because some field
 * held something unexpected, and a credential in a field nobody would think to redact passes a
 * name filter untouched. Names and types say what arrived wrong, which is all a dead letter is
 * read for, and the bytes themselves are still in the source topic for Kafka's retention.
 */
function describeShape(value: unknown, depth = 0): unknown {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string') return `string(${(value as string).length})`;
  if (type !== 'object') return type;
  if (depth >= SHAPE_MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) {
    // One element's shape stands for the array: this payload is a rejection either way.
    return value.length ? [`array(${value.length})`, describeShape(value[0], depth + 1)] : ['array(0)'];
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>).slice(0, SHAPE_MAX_KEYS)) {
    out[key] = describeShape(inner, depth + 1);
  }
  return out;
}

function shapeOf(parsed: unknown): string | null {
  // A bare string or array carries no field names, so there is nothing worth describing - and the
  // earlier finding on this seam asked for no body at all in that case (PR #129 review).
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  try {
    // Object.entries runs enumerable getters, so a hostile payload can throw in here.
    return JSON.stringify(describeShape(parsed));
  } catch {
    return null;
  }
}

function safeBody(parsed: unknown): string | null {
  // Valid JSON need not be an object: `"Bearer eyJ..."` and `["Bearer eyJ..."]` both parse, and
  // redaction works on field *names*, so a bare string has nothing to redact and would be copied
  // into the dead-letter topic verbatim. No field names, no body (PR #129 review).
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  try {
    return JSON.stringify(redactDeep(parsed));
  } catch {
    return null;
  }
}
