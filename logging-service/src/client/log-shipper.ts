/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated this shipper from the field convention on issue #52 and the plan Cole Lin
 *        approved on 2026-10-16: stdout always, Kafka when a publisher is wired in, a bounded
 *        buffer that drops rather than blocks, and no broker needed in order to log.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Key each message by requestId, after the team's Kafka rule 5 landed in root
 *        AGENTS.md §3 while this was being written.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Strip the query string here rather than trusting every caller, after the SoCLaaS
 *        review of PR #90 pointed out this is the one place every service shares.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: After the reviews of PR #129: redact sensitive field names recursively, stop a
 *        caller's fields from overwriting the envelope, and make stop() wait for a publish
 *        that is already in flight.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: After the reviews of PR #130: truncate beyond the depth limit instead of returning the
 *        subtree, drop function values so a toJSON hook cannot bypass redaction, and clear the
 *        publish guard by identity so a synchronous throw cannot disable shipping for good.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: After the third review round on PR #129: match sensitive names as substrings so
 *        adminToken and customerEmail are caught, and make emit() unable to throw on a value
 *        JSON cannot serialise.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Convert a Date to an ISO string rather than passing the object through, so a
 *        caller-controlled toJSON cannot run during serialisation (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */
import { randomUUID } from 'node:crypto';

// AI-generated (reviewed by Cole Lin).

/**
 * The canonical copy of the shipper every service uses. This repository has no shared package, so
 * copy this file into `<service>/src/common/log-shipper.ts` rather than importing it across
 * folders — and when it changes here, change it there. It lives under src/ so `npm test` covers
 * it; the Logging Service itself does not use it.
 *
 * It deliberately has no Kafka client: a `LinePublisher` is handed in, so a service takes on the
 * client (`@confluentinc/kafka-javascript`, the one Credit pinned in #85) only when it has a
 * broker to talk to. Until the shared broker (#75) exists, every service passes no publisher and
 * logs to stdout only, exactly as it does today.
 */

export type Level = 'debug' | 'info' | 'warn' | 'error';

/** What a caller passes. `event` is the only required part; the rest is whatever it was about. */
export interface LineInput {
  level: Level;
  event: string;
  requestId?: string;
  userId?: string;
  role?: string;
  method?: string;
  /**
    * The path. Anything from the first `?` is removed before the line is written, so a caller's
    * coordinates cannot reach a log line that also names them — passing a full URL here is safe.
    */
  path?: string;
  status?: number;
  durationMs?: number;
  [field: string]: unknown;
}

/** One line on its way to the topic. */
export interface OutboundLine {
  /**
   * The Kafka message key. Kafka keeps order only per key (root AGENTS.md §3, rule 5), so lines
   * are keyed by `requestId`: one request's lines land in one partition, in the order they
   * happened. A line with no request (a startup or purge line) has no key and may be interleaved,
   * which costs nothing because there is no sequence to preserve.
   */
  key?: string;
  value: string;
}

/** Whatever actually puts lines on the topic. */
export interface LinePublisher {
  publish(lines: OutboundLine[]): Promise<void>;
}

export interface ShipperOptions {
  /** This service's name, as it will appear in the `service` column. */
  service: string;
  publisher?: LinePublisher;
  /** Lines held while a publish is in flight. Beyond this, lines are dropped. */
  maxBuffer?: number;
  /** How often the buffer is drained, in milliseconds. */
  flushMs?: number;
  /** Where the line goes locally. Replaced in tests. */
  write?: (line: string) => void;
  /** Minted per line. Replaced in tests so output is predictable. */
  newId?: () => string;
}

/**
 * Field names whose values must never reach a log line, matched case-insensitively and ignoring
 * `-` and `_`, so `X-Service-Key`, `service_key` and `serviceKey` are all caught. Adapted from
 * user-service/src/common/logger.ts, which has the same list for the same reason (root AGENTS.md:
 * never log passwords, tokens, OTPs or unmasked personal data).
 */
const NEVER_LOG = [
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'otp',
  'otphash',
  'code',
  'token',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
  'authorization',
  'servicekey',
  'xservicekey',
  'privatekey',
  'secret',
  'email',
  'newemail',
  'emailhash',
  'mobile',
  'mobilenumber',
  'balance',
  'creditbalance',
  'credits',
];

const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
const MAX_DEPTH = 6;

/**
 * Matched as a **substring** of the normalised key, not as the whole key: `adminToken`,
 * `passwordResetToken`, `apiSecret` and `customerEmail` all have to be caught, and listing every
 * compound anyone might invent is not possible (PR #129 review). This over-redacts — `tokenCount`
 * goes too — which is the right direction to err in for a log line.
 */
function isSensitive(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[-_]/g, '');
  return NEVER_LOG.some((name) => normalised.includes(name));
}

/**
 * A copy of `value` with every sensitive field replaced, at any depth. Redaction is by field name,
 * so it only works on structured data: never interpolate a secret into a message string, because
 * nothing can strip it back out. A line is written once and may end up in a store anyone with
 * access can query, so this is the last point at which anything can be removed.
 */
export function redactFields(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  // Beyond the limit the subtree is replaced, not returned: returning it would serialise a secret
  // nested deeper than this verbatim, and would let a cycle through to JSON.stringify, which
  // throws — crashing the caller over a log line (PR #130 review).
  if (depth > MAX_DEPTH) return TRUNCATED;
  // An ISO string, not the object. JSON.stringify would call the Date's toJSON — and a Date with
  // its own toJSON, or a subclass overriding it, could return anything at all, after redaction
  // has finished (PR #129 review). This is what an honest Date serialised to anyway.
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => serialisable(redactFields(item, depth + 1)));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    // A function is dropped. JSON.stringify ignores functions anyway, except an own `toJSON`,
    // which it calls instead of reading the object — so copying one across would let it return
    // whatever it liked, unredacted, including a replacement for the whole envelope.
    if (typeof item === 'function') continue;
    out[key] = isSensitive(key) ? REDACTED : serialisable(redactFields(item, depth + 1));
  }
  return out;
}

/**
 * JSON cannot serialise every value a caller might pass: a `bigint` makes JSON.stringify throw,
 * which would replace the operation being logged with a TypeError (PR #129 review). emit() must
 * never throw, so the unsupported primitives become text.
 */
function serialisable(value: unknown): unknown {
  if (typeof value === 'bigint') return `${value}`;
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'number' && !Number.isFinite(value)) return `${value}`;
  return value;
}

export class LogShipper {
  private readonly buffer: OutboundLine[] = [];
  private readonly maxBuffer: number;
  private timer?: NodeJS.Timeout;
  private publishing?: Promise<void>;
  readonly counts = { emitted: 0, dropped: 0, failed: 0 };

  constructor(private readonly options: ShipperOptions) {
    this.maxBuffer = options.maxBuffer ?? 1000;
    if (options.publisher) {
      this.timer = setInterval(() => void this.flush(), options.flushMs ?? 1000);
      // Never hold the process open just to ship a log line.
      this.timer.unref();
    }
  }

  /**
   * Records one line and returns immediately: nothing here is awaited, so a slow or dead broker
   * cannot slow a request down. The line always reaches stdout, so a line dropped from a full
   * buffer is still in the container log — which is what makes dropping acceptable rather than
   * lossy.
   */
  emit(input: LineInput): void {
    const { level, event, path, ...rest } = input;
    const payload = this.serialise({
      // The caller's own fields go in FIRST, so the envelope below always wins: a line claiming
      // `service: "gateway"` or its own `ts` would make the store unreadable.
      ...(redactFields(rest) as Record<string, unknown>),
      // One id, shared by the stdout line and the Kafka message, so reading stdout later cannot
      // double-count what the store already has.
      lineId: (this.options.newId ?? randomUUID)(),
      ts: new Date().toISOString(),
      service: this.options.service,
      level,
      event,
      // Stripped here, at the one point every service shares, rather than relying on each copy of
      // this file to remember: `?lat=…&lon=…` is the caller's position, and this line carries
      // their userId (root AGENTS.md: never log unmasked personal data).
      ...(path === undefined ? {} : { path: path.split('?')[0] }),
    });
    this.counts.emitted += 1;
    (this.options.write ?? console.log)(payload);

    if (!this.options.publisher) return;
    if (this.buffer.length >= this.maxBuffer) {
      this.counts.dropped += 1;
      return;
    }
    this.buffer.push({ key: input.requestId, value: payload });
  }

  /**
   * JSON for one line, or a line saying it could not be built. Nothing a caller passes may turn a
   * log call into an exception on the path being logged.
   */
  private serialise(line: Record<string, unknown>): string {
    try {
      return JSON.stringify(line);
    } catch (err) {
      return JSON.stringify({
        lineId: line.lineId,
        ts: line.ts,
        service: line.service,
        level: 'error',
        event: 'line_unserialisable',
        reason: err instanceof Error ? err.message : 'unknown',
        originalEvent: typeof line.event === 'string' ? line.event : null,
      });
    }
  }

  /** Drains the buffer. Safe to call while one is already running; one publish at a time. */
  async flush(): Promise<void> {
    if (this.publishing) return this.publishing;
    if (!this.options.publisher || !this.buffer.length) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    const publisher = this.options.publisher;
    const pending = (async () => {
      try {
        // Awaited inside the promise, so a publisher that throws synchronously is still caught
        // here rather than before `this.publishing` has been assigned (PR #130 review).
        await publisher.publish(batch);
      } catch {
        // The lines are already on stdout, so losing them here is a counted inconvenience, not a
        // reason to grow the buffer without limit or to crash a service that was only logging.
        this.counts.failed += batch.length;
      }
    })();
    this.publishing = pending;
    try {
      await pending;
    } finally {
      // By identity: clearing unconditionally could wipe a newer publish's guard, and leaving a
      // settled promise in place would make every later flush() a no-op, disabling shipping for
      // the life of the process.
      if (this.publishing === pending) this.publishing = undefined;
    }
  }

  /** Flushes what is left and stops the timer. Call from onModuleDestroy. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    // Twice, deliberately: the first await is the publish already in flight, which flush() joins
    // rather than starting a second one; the second sends whatever was buffered while it ran.
    await this.flush();
    await this.flush();
  }
}
