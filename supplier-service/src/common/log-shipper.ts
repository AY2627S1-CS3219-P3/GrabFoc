/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Copied from logging-service/src/client/log-shipper.ts, the canonical copy. This
 *        repository has no shared package, so common code is copied, not imported: a change there
 *        has to be repeated here. This copy brings the fixes from the #129 and #145 reviews - all
 *        reads of the caller's input inside the serialisation guard, and a fixed reason instead of
 *        an exception message in the fallback line.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-25
 * Scope: Call Date.prototype.toISOString rather than the value's own, so an override cannot
 *        run after redaction (PR #145 review).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
 * Scope: Sanitise field *names* as well as values, and bound the buffer in bytes as well as
 *        in lines (PR #129 review). Body kept identical to the canonical copy.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
 * Scope: A field named `__proto__` no longer disappears, and personal-name fields are redacted
 *        (PR #129 review). Body kept identical to the canonical copy.
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
  /**
   * Bytes held while a publish is in flight, across all buffered lines. A count alone is not a
   * bound: 1,000 lines carrying a megabyte of metadata each is a gigabyte held by the component
   * whose whole purpose is not to disrupt the service it logs for (PR #129 review).
   */
  maxBufferBytes?: number;
  /** A single line larger than this is written to stdout but never buffered. */
  maxLineBytes?: number;
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
  // Personal data rather than credentials, and just as unloggable: a display name identifies a
  // student on sight, and `phone` sat outside `mobile` (root AGENTS.md: never log unmasked
  // personal data). Found on the ingest side of this list in the PR #129 review.
  'phone',
  'displayname',
  'fullname',
  'firstname',
  'lastname',
  'balance',
  'creditbalance',
  'credits',
];

const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
// A field name a caller would plausibly write. Only values were ever redacted, so a caller passing
// `{ recipients: { 'alice@nus.edu.sg': true } }` shipped an address as a field name with nothing
// flagged (PR #129 review). An unsafe name is replaced whole, not truncated: half an address is
// still half an address. The same rule is in the logging service's line.schema.ts and in its
// dead-letter shape, and the three must agree.
const SAFE_KEY = /^[A-Za-z0-9_.:-]{1,64}$/;

function safeKey(key: string, index: number): string {
  // `__proto__` passes the pattern but is never a usable field name: assigning it to an ordinary
  // object runs Object.prototype's setter instead of defining a property, and the field is lost.
  // The objects built below have null prototypes, so nothing is lost there - but the store's
  // inbound schema builds its own object through Zod, which does drop that name, so it is
  // replaced here rather than shipped and the two sides cannot disagree (PR #129 review).
  return SAFE_KEY.test(key) && key !== '__proto__' ? key : `[key ${index}: ${key.length} chars]`;
}
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
  // Date.prototype.toISOString, not value.toISOString(): a subclass or an own override would
  // otherwise run after redaction has decided this field is safe, and could return a token from
  // an innocent-looking field (PR #145 review).
  if (value instanceof Date) return Date.prototype.toISOString.call(value);
  if (Array.isArray(value)) return value.map((item) => serialisable(redactFields(item, depth + 1)));
  // Null-prototype, so a field named `__proto__` becomes an own property like any other. On a
  // plain `{}`, `out['__proto__'] = item` runs Object.prototype's setter instead of defining a
  // property, so that field vanished from the line - silently, with every neighbouring field
  // intact, which is the worst way to lose one from a record kept for audit (PR #129 review).
  // JSON.stringify and object spread both read own enumerable properties, so the envelope below
  // is built from this unchanged, and no caller's field name can reach a prototype.
  const out: Record<string, unknown> = Object.create(null);
  Object.entries(value as Record<string, unknown>).forEach(([key, item], index) => {
    // A function is dropped. JSON.stringify ignores functions anyway, except an own `toJSON`,
    // which it calls instead of reading the object — so copying one across would let it return
    // whatever it liked, unredacted, including a replacement for the whole envelope.
    if (typeof item === 'function') return;
    out[safeKey(key, index)] = isSensitive(key) ? REDACTED : serialisable(redactFields(item, depth + 1));
  });
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
  private readonly maxBufferBytes: number;
  private readonly maxLineBytes: number;
  /** Bytes currently buffered. Kept as a running total rather than recomputed per emit. */
  private bufferedBytes = 0;
  private timer?: NodeJS.Timeout;
  private publishing?: Promise<void>;
  readonly counts = { emitted: 0, dropped: 0, oversize: 0, failed: 0 };

  constructor(private readonly options: ShipperOptions) {
    this.maxBuffer = options.maxBuffer ?? 1000;
    // 4 MB and 64 KB: a log line that does not fit in 64 KB is a bug in the caller, and 4 MB is
    // small enough that holding it through a broker outage is not what takes a service down.
    this.maxBufferBytes = options.maxBufferBytes ?? 4 * 1024 * 1024;
    this.maxLineBytes = options.maxLineBytes ?? 64 * 1024;
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
    const { payload, key } = this.build(
      (this.options.newId ?? randomUUID)(),
      new Date().toISOString(),
      input,
    );
    this.counts.emitted += 1;
    (this.options.write ?? console.log)(payload);

    if (!this.options.publisher) return;
    const bytes = Buffer.byteLength(payload);
    // Counted apart from an ordinary drop: a line too big to ship at all says something about the
    // caller, while a full buffer says something about the broker.
    if (bytes > this.maxLineBytes) {
      this.counts.oversize += 1;
      return;
    }
    if (this.buffer.length >= this.maxBuffer || this.bufferedBytes + bytes > this.maxBufferBytes) {
      this.counts.dropped += 1;
      return;
    }
    this.buffer.push({ key, value: payload });
    this.bufferedBytes += bytes;
  }

  /**
   * JSON for one line, or a line saying it could not be built. Nothing a caller passes may turn a
   * log call into an exception on the path being logged.
   */
  private build(lineId: string, ts: string, input: LineInput): { payload: string; key?: string } {
    // Read once, defensively, so the fallback line can still say which event failed.
    let originalEvent: string | null = null;
    try {
      originalEvent = typeof input.event === 'string' ? input.event : null;
    } catch {
      originalEvent = null;
    }

    try {
      // **Everything** that reads the caller's input happens in here. Destructuring it runs an
      // enumerable getter, and a Proxy trap runs on enumeration, so doing it outside meant a
      // hostile top-level field could still throw out of emit() — which the earlier guard claimed
      // to prevent and did not (PR #145 review).
      const { level, event, path, ...rest } = input;
      const safeRest = redactFields(rest) as Record<string, unknown>;
      const payload = JSON.stringify({
        // The caller's own fields go in FIRST, so the envelope always wins: a line claiming
        // `service: "gateway"` or its own `ts` would make the store unreadable.
        ...safeRest,
        lineId,
        ts,
        service: this.options.service,
        level,
        event,
        // Stripped here, at the one point every service shares, rather than relying on each copy of
        // this file to remember: `?lat=…&lon=…` is the caller's position, and this line carries
        // their userId (root AGENTS.md: never log unmasked personal data).
        ...(path === undefined ? {} : { path: `${path}`.split('?')[0] }),
      });
      // From the redacted copy, so the Kafka key cannot be a value redaction removed.
      const key = typeof safeRest.requestId === 'string' ? safeRest.requestId : undefined;
      return { payload, key };
    } catch {
      // A fixed reason, never the exception's message: the exception came from the caller's own
      // getter, so its message is caller-controlled text and could carry the very secret the
      // field-name redaction exists to remove (PR #129 review).
      return {
        payload: JSON.stringify({
          lineId,
          ts,
          service: this.options.service,
          level: 'error',
          event: 'line_unserialisable',
          reason: 'the line could not be built',
          originalEvent,
        }),
      };
    }
  }

  /** Drains the buffer. Safe to call while one is already running; one publish at a time. */
  async flush(): Promise<void> {
    if (this.publishing) return this.publishing;
    if (!this.options.publisher || !this.buffer.length) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    // The buffer is what holds the memory; once the batch is out of it the budget is free again,
    // whether or not the publish then succeeds. Lines are never put back - they are on stdout.
    this.bufferedBytes = 0;
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
