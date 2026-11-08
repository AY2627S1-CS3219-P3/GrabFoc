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
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
 * Scope: A field named `__proto__` no longer drops out of the parked shape (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Refuse to consume without a dead-letter sink, rather than committing the offset of a
 *        message there is nowhere to park (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Say what handle() actually throws, since the consumer #75 has yet to write is the thing
 *        that has to not swallow it (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Keep a sanitised key a fixed point in the parked shape too (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-06
 * Scope: Replace a key that carries a code rather than naming a field (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-07
 * Scope: Keep a caller key spelled like a marker from overwriting the key it collides with
 *        in the parked shape (PR #157 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-07
 * Scope: Make the collision name marker-shaped, so the walkers still agree on it (PR #157 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-07
 * Scope: Trust a marker only when its numbers are ones this walk could have written, so a caller
 *        key shaped like one cannot carry its own digits through (PR #157 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-07
 * Scope: Generate a replaced field name from its own ordinal instead of bounding the
 *        numbers a caller may put inside one (PR #200 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Describe the replacement the walk now makes, not the one it used to (PR #200 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: a broker that cannot be reached no longer takes the query API down with it,
 *        which is what every message in this method already promised (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: retry a consumer that could not start, rather than leaving ingest off for the
 *        life of a healthy container and an empty store nobody notices (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: do not announce consuming when the attempt failed and a retry is pending
 *        (issue #52).
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
  readonly counts = { stored: 0, duplicate: 0, rejected: 0, failed: 0, deadLettered: 0, deadLetterFailed: 0 };

  private stopped = false;
  private retry?: NodeJS.Timeout;

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
        `LOGGING_KAFKA_BROKERS is set but no LINE_CONSUMER is provided: ingest is off, the query ` +
          `API is up. Lines produced to "${config.kafkaTopic}" wait in the topic. app.module.ts ` +
          `provides KafkaIngest whenever brokers are set, so reaching this means that list was ` +
          `changed or a test is constructing this service on its own.`,
      );
      return;
    }
    if (!this.deadLetters) {
      // Both providers are @Optional(), so this configuration can be handed to us - and consuming
      // in it loses lines. reject() would have nowhere to park a message it cannot store, so
      // handle() resolves, the offset is committed, and the message is gone from the pipeline:
      // the one outcome the parking path exists to prevent. Not starting leaves it in the topic
      // for Kafka's retention, and the query API comes up either way (PR #129 review). An error
      // rather than a warning: unlike a missing consumer, nothing about this is a normal way to
      // run the service.
      this.logger.error(
        `A line consumer is wired in but no dead-letter sink (DEAD_LETTERS) is: ingest is off, ` +
          `the query API is up. Consuming without one would commit the offset of every message ` +
          `this service cannot store and lose it; lines wait in "${config.kafkaTopic}" instead. ` +
          `Provide DEAD_LETTERS, which parks them in "${config.kafkaDeadLetterTopic}".`,
      );
      return;
    }
    // No log line here: startConsuming() resolves whether or not it succeeded, because a failure
    // schedules a retry rather than rejecting - so announcing success from this point said the
    // service was consuming while nothing was, and an operator reading it would have called ingest
    // healthy with an empty store. The success line is inside the branch that earned it (review).
    await this.startConsuming();
  }

  /**
   * Starts consuming, and keeps trying if it cannot.
   *
   * Guarded first because a broker that is not reachable must not take this service down: `start()`
   * connects an admin client and a consumer, and an unhandled rejection here fails Nest's
   * bootstrap, exits the container, and takes the query API - which needs no broker at all - with
   * it. Every message in this method promises the opposite.
   *
   * Retried because giving up once is almost as bad. On a fresh `docker compose up` this service
   * waits only for its own database, so it reaches this point while Kafka is still starting and
   * before kafka-init has created the topics - and `onApplicationBootstrap` runs once. The
   * container stays healthy, the query API answers, and the store silently never fills, which is
   * the one failure nobody would notice. `depends_on` is not the fix: this compose file is also
   * run on its own, where no `kafka` service exists to depend on.
   *
   * Backs off to 30s and keeps going: the broker coming back is a normal event, not an error.
   */
  private async startConsuming(attempt = 0): Promise<void> {
    if (this.stopped || !this.consumer) return;
    try {
      await this.consumer.start((message) => this.handle(message));
      this.logger.log(`Consuming "${config.kafkaTopic}" as "${config.kafkaGroupId}"`);
    } catch (err) {
      if (this.stopped) return;
      const delay = Math.min(30_000, 1000 * 2 ** attempt);
      this.logger.error(
        `Could not start consuming "${config.kafkaTopic}": ${err instanceof Error ? err.message : err}. ` +
          `The query API is up and lines wait in the topic; retrying in ${delay}ms.`,
      );
      this.retry = setTimeout(() => void this.startConsuming(attempt + 1), delay);
      // Never hold the process open just to retry a log consumer.
      this.retry.unref();
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Before stopping, so an in-flight retry does not start a consumer after teardown.
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    await this.consumer?.stop();
  }

  /**
   * Stores one message.
   *
   * A message this cannot parse, cannot validate, or that the store refuses *permanently* is
   * counted and parked rather than rethrown: one malformed line from one service must not stop the
   * consumer and block every other service's logging behind it.
   *
   * It **does** throw when the failure is ours rather than the message's - the store briefly
   * unreachable, or the dead-letter park itself failing - and that is load-bearing, not a leak.
   * The consumer must let it propagate and leave the offset uncommitted so the broker redelivers
   * (root AGENTS.md section 3, rule 2); the contract is on `MessageHandler` in consumer.ts. A
   * consumer that catches it and commits anyway drops every line written during a database
   * restart, with nothing but `counts.failed` to say so. This docstring used to say "never
   * throws", which is the one thing that would have made writing such a consumer reasonable
   * (PR #129 review).
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
        // Shape, not values, for the same reason as the validation path: a line can be
        // schema-valid and still hold a credential in a field no name filter knows, and this
        // one is not being stored - the store just refused it - so the dead-letter topic
        // would be the only place those values live (PR #129 review).
        await this.reject(message, `the store rejected it (SQLSTATE ${permanent})`, shapeOf(result.data));
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
    // Defensive now rather than reachable: onApplicationBootstrap refuses to consume without a
    // sink, so nothing in a running service reaches this. handle() is public, though, and it may
    // not throw on a missing sink for the callers that remain.
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
// A field name a producer would plausibly write. Anything else is not described, because a key is
// as caller-controlled as a value: `{ "Bearer eyJ...": "x" }` put the token in the body as a key
// even once the values had been reduced to types (PR #129 review). Truncating an unsafe key is no
// good either - 40 characters of a token is still 40 characters of a token - so it is replaced
// whole, by this walk's own count of replacements. Same rule and same replacement as
// line.schema.ts and the shipper: an ordinal over the same keys in the same order is the same
// name on both sides, so one bad name reads alike wherever it surfaces.
const SAFE_KEY = /^[A-Za-z0-9_.:-]{1,64}$/;
/**
 * A key that reads as a field *name*, which is to say it starts with a letter.
 *
 * Redaction matches names, so a secret in the *key* position has no name to match on:
 * `{ attempts: { "123456": true } }` carries a six-digit OTP that `isSensitive` cannot see, and
 * the safe alphabet above admitted it because its characters are unremarkable (PR #129 review).
 * The test is deliberately structural rather than a guess at content - no entropy, no "looks like
 * a token" - because this component cannot tell a secret from a number by looking at it. What it
 * can tell is that a *name* is not a bare number, and that something which is not a name and is
 * long enough to hold a code is data someone put in the key position.
 */
const NAMED_KEY = /^[A-Za-z]/;
/**
 * How long a key that is not a name may be before it is replaced.
 *
 * Three keeps the bucket labels that carry real diagnostic value - `{ counts: { "403": 12 } }`,
 * small indices - and replaces the shortest credential this product has. The OTP length is still
 * being settled (the mockup shows 4, the proposal is 6, root AGENTS.md section 10), so it is set
 * to the *shorter* of the two: choosing 6 would leave the guard silently useless if the 4-digit
 * mockup wins the argument. The cost is that a key like `2026` is replaced, which is a visible
 * loss in a line rather than a silent one, and this is the number to change if that cost turns
 * out to matter more than the codes it catches.
 */
const MAX_UNNAMED_KEY = 3;
/**
 * Whether a key can be used as a field name as it stands.
 *
 * A name is spelled from the safe alphabet, starts with a letter unless it is too short to carry
 * anything, and is not `__proto__` - which passes the pattern but is never a usable property name,
 * because assigning it runs `Object.prototype`'s setter instead of defining a field.
 */
function isUsableName(key: string): boolean {
  if (!SAFE_KEY.test(key) || key === '__proto__') return false;
  return NAMED_KEY.test(key) || key.length <= MAX_UNNAMED_KEY;
}

/**
 * The stand-in for a name that cannot be used: `[key 1]`, `[key 2]`, by order of replacement.
 *
 * Six rounds of review bounded what a caller could put *inside* a replaced name, and each bound
 * fell to a spelling the previous one allowed: the length field disagreed between passes, the
 * fixed point let a caller key shaped like a marker through, the collision suffix broke the fixed
 * point, the numeric limit fell to leading zeroes (`Number('000000')` is 0), and the index range
 * still left four digits in a wide enough object (PRs #129, #145, #157 and #200 reviews).
 *
 * So no caller text is trusted at all. The ordinal is this walk's own count, which a caller cannot
 * influence; it cannot collide with a kept name, because a kept name comes from an alphabet with
 * no brackets or spaces in it; and it is a fixed point by construction - a later walk over the
 * same keys in the same order reaches the same key at the same ordinal and writes the same name.
 *
 * That is also why the three walkers agree without sharing anything: the shipper walks a line's
 * metadata, the store walks the whole line and skips its columns, and this shape walks what could
 * be parsed - but the *replacements* are the same keys in the same order, so the ordinals match.
 * The earlier design needed each walker to compute the same position, which they never did.
 */
function replacedName(ordinal: number): string {
  return `[key ${ordinal}]`;
}

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
  // Null-prototype, as in line.schema.ts: `out['__proto__'] = shape` on an ordinary object runs
  // Object.prototype's setter, and that field would be missing from the shape with no sign it was
  // ever there - in the one record that exists to say what arrived (PR #129 review).
  const out: Record<string, unknown> = Object.create(null);
  let replaced = 0;
  for (const [key, inner] of Object.entries(value as Record<string, unknown>).slice(0, SHAPE_MAX_KEYS)) {
    // As in the other two walkers: a field that will not be written must not spend an ordinal.
    if (inner === undefined) continue;
    const name = isUsableName(key) ? key : replacedName((replaced += 1));
    out[name] = describeShape(inner, depth + 1);
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
