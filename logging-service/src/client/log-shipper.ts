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
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Guard the redaction walk as well as the serialisation, so a throwing getter or Proxy
 *        trap cannot escape emit() (PR #129 review).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Read the caller's input inside that guard too, and never put an exception's message in
 *        a line — both from the PR #129 and #145 reviews.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-25
 * Scope: Call Date.prototype.toISOString rather than the value's own, so an override cannot
 *        run after redaction (PR #145 review).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
 * Scope: After the seventh review round on PR #129: sanitise field *names* as well as
 *        values, and bound the buffer in bytes as well as in lines.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
 * Scope: A field named `__proto__` no longer disappears from a line, and personal names -
 *        display, given and family names, and `phone` - are redacted (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Bring every field the log store bounds inside that bound before shipping it, so a caller
 *        cannot use one over-long field to keep a whole line out of the searchable store
 *        (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Guard the local write too - it was the one statement outside emit()'s guard, so a sink
 *        that throws took down the request it was logging (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Keep the requestId on the fallback line, so the one record that a log call failed is
 *        still on the request it failed on (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Guard the other two caller-supplied parts of the options: a newId that throws, and a
 *        flushMs setInterval cannot schedule. Hold the validated service name rather than
 *        rereading the caller's object per line (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Take out of the metadata what the store's JSONB cannot hold, and rebuild an array
 *        without going through the caller's own `map` (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Hold every option in a field, so nothing of the caller's object is read after
 *        construction, and fall back when newId returns an id the store would refuse
 *        (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Keep a sanitised key a fixed point, and strip every separator before matching a
 *        sensitive name (PR #129 review).
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
  /**
   * A fixed name for what happened - `access_denied`, `jwks_unavailable` - and **never** text
   * built from a request. It is an envelope field, so it is the one thing here that redaction
   * cannot help with: `redactFields` works on field *names*, and the value of `event` is written
   * through on the ordinary path and echoed as `originalEvent` on the fallback path alike. A
   * reviewer read the fallback as the leak; it is not, because the ordinary path carries the same
   * value to the same two places. The rule is about what may go in this field at all, and it
   * applies to every call site (PR #129 review).
   */
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

/**
 * `value` with the characters PostgreSQL's JSONB cannot represent removed: a NUL, and a surrogate
 * with no partner. JSONB stores text, and PG text cannot hold a NUL at all; an unpaired surrogate
 * reaches the server as a `\\ud800` escape, which its JSON parser refuses. Either one costs the
 * **whole line** - the insert fails with a class-22 error, ingest reads that as permanently
 * unstorable, and a line the schema had just accepted is parked instead of being searchable
 * (PR #129 review). The round before brought `method` and `path` inside what their TEXT columns
 * accept; this is the same pairing one level down, in `extra`.
 *
 * Removed rather than rejected, and the other way round from the envelope fields: `extra` is
 * free-form metadata, so a tab or a newline in a `note` is content and is kept. Only what JSONB
 * cannot carry comes out, and taking out a character costs less than losing the line. Written as
 * loops rather than regexes so the escape sequences cannot be mangled by an editing tool.
 */
function unstorableInJsonb(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === 0 || (code >= 0xd800 && code <= 0xdfff)) return true;
  }
  return false;
}

function jsonbSafe(value: string): string {
  // A valid surrogate pair trips the check above and comes back out of the loop unchanged, which
  // is why this is a fast path and not the decision itself.
  if (!unstorableInJsonb(value)) return value;
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === 0) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      // A high surrogate is kept only with the low surrogate that completes it. charCodeAt past
      // the end is NaN, so the last character of a string falls through to the drop below.
      const low = value.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        out += value[i] + value[i + 1];
        i += 1;
      }
      continue;
    }
    // A low surrogate reached on its own: the pair above consumes the valid ones.
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    out += value[i];
  }
  return out;
}

const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
// A field name a caller would plausibly write. Only values were ever redacted, so a caller passing
// `{ recipients: { 'alice@nus.edu.sg': true } }` shipped an address as a field name with nothing
// flagged (PR #129 review). An unsafe name is replaced whole, not truncated: half an address is
// still half an address. The same rule is in the logging service's line.schema.ts and in its
// dead-letter shape, and the three must agree.
//
// A filter for keys that *cannot* be field names, not a proof that the rest are safe. A later
// round asked for credential-shaped keys to go too, and `{ attempts: { '123456': true } }` really
// is a six-digit code shipped verbatim - but nothing tells it apart from `{ byStatus: { '404': 3 }
// }` or `{ byYear: { '2026': 5 } }`, which are ordinary aggregates. Redaction matches names, so it
// cannot identify a secret by its contents, in a key any more than in a value. The rule that helps
// is the call-site one in root AGENTS.md: never log an OTP or a handover code, as a value *or* as a
// field name. `otp` and `code` are in the list above, so `{ otp: { ... } }` is caught by its
// parent's name.
const SAFE_KEY = /^[A-Za-z0-9_.:-]{1,64}$/;
/**
 * The replacement below, recognised on sight. A key is sanitised more than once on its way into a
 * stored row - by the shipper, then by this side's own pass over the same object, then by the
 * dead-letter shape if the line is parked - and the marker does not match SAFE_KEY, so each pass
 * replaced the previous one's work and reported *its* length instead. `alice@nus.edu.sg` left as
 * `[key 0: 16 chars]` and was stored as `[key 0: 17 chars]`, so the row disagreed with the line on
 * stdout and on the topic about the one number the marker exists to carry (PR #129 review). It is
 * a fixed point now. A caller's own key spelled exactly like a marker passes through as well,
 * which costs nothing: the shape carries a position and a length and no content of its own, so
 * the worst case is a key that says about itself what it would have said anyway.
 */
const KEY_MARKER = /^\[key \d+: \d+ chars\]$/;

function safeKey(key: string, index: number): string {
  // `__proto__` passes the pattern but is never a usable field name: assigning it to an ordinary
  // object runs Object.prototype's setter instead of defining a property, and the field is lost.
  // The objects built below have null prototypes, so nothing is lost there - but the store's
  // inbound schema builds its own object through Zod, which does drop that name, so it is
  // replaced here rather than shipped and the two sides cannot disagree (PR #129 review).
  if (KEY_MARKER.test(key)) return key;
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
  // Every separator, not just `-` and `_`: SAFE_KEY permits `.` and `:` too, so `pass.word`
  // normalised to `pass.word`, matched nothing in the list, and `{ 'pass.word': 'hunter2' }`
  // reached stdout, the topic and the store's `extra` column in the clear (PR #129 review).
  // Stripping more can only add matches, never lose one: every name in the list is plain
  // lowercase alphanumeric, so a name that was a contiguous substring before still is.
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return NEVER_LOG.some((name) => normalised.includes(name));
}

/**
 * A copy of `value` with every sensitive field replaced, at any depth. Redaction is by field name,
 * so it only works on structured data: never interpolate a secret into a message string, because
 * nothing can strip it back out. A line is written once and may end up in a store anyone with
 * access can query, so this is the last point at which anything can be removed.
 */
export function redactFields(value: unknown, depth = 0): unknown {
  // Strings first: these land in the store's `extra` JSONB column, which cannot hold a NUL or a
  // lone surrogate - and a value it cannot hold costs the whole line. See `jsonbSafe` above.
  if (typeof value === 'string') return jsonbSafe(value);
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
  if (Array.isArray(value)) {
    // Built by index into a plain array rather than with `value.map`: `Array.prototype.map` goes
    // through `Symbol.species`, so mapping a subclass returned another instance of that subclass -
    // prototype and all - and `JSON.stringify` then called its inherited `toJSON` *after*
    // redaction had finished, free to return anything. Dropping own function values does not help:
    // a class puts `toJSON` on the prototype, where `Object.entries` never looks. An overridden
    // `map` would have been caller code running inside the walk as well (PR #129 review).
    const items: unknown[] = [];
    for (let i = 0; i < value.length; i += 1) {
      items.push(serialisable(redactFields(value[i], depth + 1)));
    }
    return items;
  }
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

/**
 * The store's bounds on the envelope, from logging-service/src/lines/line.schema.ts. A value
 * outside them does not cost the field - it costs the **whole line**, because `inboundLineSchema`
 * rejects the line and ingest parks it in the dead-letter topic. A caller who controls one field
 * can therefore keep a line it would rather nobody queried out of the searchable store while
 * leaving it on a producer's stdout, where nobody looks: a 500-character URL did exactly that to
 * an `access_denied` line (PR #129 review). So every bound the store applies is applied here
 * first, and the two sides cannot disagree. When one changes there, change it here - the spec
 * checks a shipped line against that schema itself rather than against these numbers, so a bound
 * added there and forgotten here fails a test rather than quietly costing lines.
 */
const STORE_LIMITS = { service: 40, event: 60, requestId: 200, userId: 100, method: 10, path: 400 } as const;
const LEVELS: readonly Level[] = ['debug', 'info', 'warn', 'error'];
const ROLES: readonly string[] = ['ADMIN', 'USER'];
/**
 * A line whose level this cannot read is surfaced rather than filed as routine: the store's enum
 * would otherwise reject it outright, and a line nobody can explain is worth a reader's attention
 * more than it is worth burying in `info`.
 */
const UNKNOWN_LEVEL: Level = 'error';
const UNKNOWN_EVENT = 'line_event_missing';

/**
 * `value` with control characters removed. The store refuses them in most of these fields because
 * a line-oriented reader breaks on them - and losing a whole line over one stray tab in a header
 * is the outcome this is here to prevent.
 */
function hasControl(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) as number;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function stripControl(value: string): string {
  if (!hasControl(value)) return value;
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) as number;
    if (code >= 0x20 && code !== 0x7f) out += ch;
  }
  return out;
}

/**
 * `value` when the store would hold it in that field, otherwise undefined: the field is left out
 * and the line itself still gets through. An id is dropped rather than cut, because the first 100
 * characters of a 300-character userId read as a *different* student's id, and a cut requestId
 * groups one request's lines under another's. An absent field is honest; a wrong one reads as
 * fact.
 */
function boundedId(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Dropped rather than stripped, for the same reason it is not cut: a tab taken out of
  // `trace<TAB>1` leaves `trace1`, which may be some other request's id.
  return value.length >= 1 && value.length <= max && !hasControl(value) ? value : undefined;
}

/**
 * `value` cut to `max`, marked, and never dropped: `event` and `path` are the two fields a reader
 * searches by, and the leading characters are the informative part of both. The marker sits inside
 * the bound, so the result is still storable, and it says the value was longer rather than passing
 * a cut path off as the resource that was asked for.
 */
function boundedText(value: string, max: number): string {
  // `jsonbSafe` as well as `stripControl`, because this function's third caller is the fallback
  // line's `originalEvent`, which is not an envelope field and so lands in the store's `extra`
  // JSONB. For `event` and `path` it changes nothing worth keeping: they go to TEXT columns, where
  // a lone surrogate is encoded rather than refused (PR #129 review).
  const text = jsonbSafe(stripControl(value));
  return text.length <= max ? text : `${text.slice(0, max - TRUNCATED.length)}${TRUNCATED}`;
}

/**
 * setInterval takes a signed 32-bit delay and silently reduces anything else - a larger number, a
 * fraction, zero, NaN - to about 1 ms. With a publisher wired in that is a flush loop for the life
 * of the process, from the component whose whole purpose is not to disturb the service it logs for
 * (PR #129 review). PurgeService guards its own timer for the same reason, by clamping; this one
 * refuses, because `flushMs` is written in code rather than read from the environment, and a
 * constructor is allowed to fail where `emit()` is not.
 */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * What the store accepts as a `lineId` - the same shape `z.string().uuid()` matches. A regex is
 * safe here where it was not for the control characters: there is no escape sequence in it for an
 * editing tool to mangle.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `value` when the store would hold it in that column, otherwise undefined. */
function boundedInt(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
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
  /**
   * The validated service name. Read once here rather than from `this.options` per line: the caller
   * keeps the object it passed, and the check in the constructor only ever saw the value that was
   * in it then. Mutating it afterwards misattributed every later line - or, with an overlong or
   * control-bearing name, made every later line unstorable - without passing that check again
   * (PR #129 review).
   */
  private readonly service: string;
  /**
   * The rest of the options, held for the same reason as the name above: a property read on an
   * object the caller still owns is itself caller code. Guarding the *call* to `newId` was not
   * enough - `this.options.newId` ran before the guard, and `this.options.publisher` in `emit()`
   * ran outside one altogether, so an accessor or a Proxy trap that throws escaped `emit()` anyway.
   * After this constructor there is nothing of the caller's left to read (PR #129 review).
   */
  private readonly write?: (line: string) => void;
  private readonly newId?: () => string;
  private readonly publisher?: LinePublisher;
  readonly counts = { emitted: 0, dropped: 0, oversize: 0, failed: 0, clamped: 0, writeFailed: 0, idFailed: 0 };

  constructor(options: ShipperOptions) {
    // Checked at construction, not per line: a name outside the store's bound makes every line
    // this service will ever write unstorable, and the startup that configured it is the only
    // place that can say so. emit() must never throw - a constructor may, and this is a
    // configuration error rather than a log call.
    if (boundedId(options.service, STORE_LIMITS.service) !== options.service) {
      throw new RangeError(
        `service must be 1-${STORE_LIMITS.service} characters and hold no control characters: the ` +
          `log store rejects every line from a service named otherwise`,
      );
    }
    this.service = options.service;
    this.write = options.write;
    this.newId = options.newId;
    this.publisher = options.publisher;
    const flushMs = options.flushMs ?? 1000;
    // Checked whether or not a publisher is wired in: a delay setInterval cannot schedule is a
    // mistake worth reporting at the line that made it, not only in the configurations that
    // happen to schedule it.
    if (!Number.isInteger(flushMs) || flushMs < 1 || flushMs > MAX_TIMER_MS) {
      throw new RangeError(
        `flushMs must be a whole number of milliseconds between 1 and ${MAX_TIMER_MS}: setInterval ` +
          `silently reduces anything else to about 1 ms, which with a publisher is a flush loop`,
      );
    }
    this.maxBuffer = options.maxBuffer ?? 1000;
    // 4 MB and 64 KB: a log line that does not fit in 64 KB is a bug in the caller, and 4 MB is
    // small enough that holding it through a broker outage is not what takes a service down.
    this.maxBufferBytes = options.maxBufferBytes ?? 4 * 1024 * 1024;
    this.maxLineBytes = options.maxLineBytes ?? 64 * 1024;
    if (this.publisher) {
      this.timer = setInterval(() => void this.flush(), flushMs);
      // Never hold the process open just to ship a log line.
      this.timer.unref();
    }
  }

  /**
   * Records one line and returns immediately: nothing here is awaited, so a slow or dead broker
   * cannot slow a request down. The line reaches stdout first, so a line dropped from a full
   * buffer is still in the container log — which is what makes dropping acceptable rather than
   * lossy. If the local sink is itself broken that justification weakens, and `counts.writeFailed`
   * is what says so; there is nothing better to do about it from in here.
   */
  emit(input: LineInput): void {
    const { payload, key } = this.build(this.newLineId(), new Date().toISOString(), input);
    this.counts.emitted += 1;
    // Guarded like the build above it. `write` is a documented option, so it is caller-supplied
    // code - and the default is no safer: stdout in a container is a pipe, a pipe write is
    // synchronous on Linux, and a reader that goes away raises EPIPE on the caller's own stack.
    // This statement was the one left outside the guard, so a dead sink threw into the request it
    // was logging and turned it into a 500: the component whose whole purpose is not to disturb
    // the service it logs for taking that service down (PR #129 review). Counted rather than
    // reported, because there is nowhere to report a broken log sink *to*.
    try {
      (this.write ?? console.log)(payload);
    } catch {
      this.counts.writeFailed += 1;
    }

    // Deliberately after that catch rather than inside an else: a broken local sink is a reason to
    // ship the line harder, not to stop, because the topic is then the only copy of it.
    if (!this.publisher) return;
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
   * An id for one line. `newId` is a documented option, so it is caller-supplied code running on
   * the request's own stack - and it ran *before* `build()`, so an exception from it escaped
   * `emit()` altogether, which is the one thing this component must not do. The same hole the
   * local `write` had, in the same statement, one argument along (PR #129 review).
   *
   * The default stands in rather than the line being dropped: the store refuses a line with no id,
   * so losing the line would be the worse of the two failures. Counted, because a generator that
   * throws on every call would otherwise leave no trace at all.
   */
  private newLineId(): string {
    if (!this.newId) return randomUUID();
    let id: unknown;
    try {
      id = this.newId();
    } catch {
      this.counts.idFailed += 1;
      return randomUUID();
    }
    // Checked, not trusted. `lineId` is the one envelope field that can be neither dropped nor
    // cut - the store requires a UUID of it - so a generator returning a counter or an adapter's
    // own id would cost every line this service writes, which is the cost `service` is checked at
    // construction to avoid. This one is per line, so it is checked per line (PR #129 review).
    if (typeof id === 'string' && UUID.test(id)) return id;
    this.counts.idFailed += 1;
    return randomUUID();
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

    // Read the same way and for the same reason. The fallback is the only record that a log call
    // failed, and it carried no requestId - so in the one service whose purpose is following a
    // request across services, the gap it left in a trace read as a line nobody wrote rather than
    // a line that was lost (PR #129 review). Bounded here rather than below, because the bound is
    // what makes it storable and `boundedId` is total: it returns undefined instead of throwing,
    // so it cannot itself be the reason this line fails too.
    let originalRequestId: string | undefined;
    try {
      originalRequestId = boundedId(input.requestId, STORE_LIMITS.requestId);
    } catch {
      originalRequestId = undefined;
    }

    try {
      // **Everything** that reads the caller's input happens in here. Destructuring it runs an
      // enumerable getter, and a Proxy trap runs on enumeration, so doing it outside meant a
      // hostile top-level field could still throw out of emit() — which the earlier guard claimed
      // to prevent and did not (PR #145 review).
      const { level, event, requestId, userId, role, method, path, status, durationMs, ...rest } = input;
      const safeRest = redactFields(rest) as Record<string, unknown>;
      // Stripped before the bound below, at the one point every service shares, rather than
      // relying on each copy of this file to remember: `?lat=…&lon=…` is the caller's position, and
      // this line carries their userId (root AGENTS.md: never log unmasked personal data).
      const withoutQuery = path === undefined ? undefined : `${path}`.split('?')[0];
      // Every field the store bounds, brought inside that bound. An `undefined` here is left out
      // of the line by JSON.stringify, which is exactly what the store's `.optional()` means.
      const envelope = {
        level: LEVELS.includes(level) ? level : UNKNOWN_LEVEL,
        event: boundedText(typeof event === 'string' ? event : '', STORE_LIMITS.event) || UNKNOWN_EVENT,
        requestId: boundedId(requestId, STORE_LIMITS.requestId),
        userId: boundedId(userId, STORE_LIMITS.userId),
        role: typeof role === 'string' && ROLES.includes(role) ? role : undefined,
        method: boundedId(method, STORE_LIMITS.method),
        path: withoutQuery === undefined ? undefined : boundedText(withoutQuery, STORE_LIMITS.path),
        status: boundedInt(status, 100, 599),
        durationMs: boundedInt(durationMs, 0, 2147483647),
      };
      // One count per line, not per field: it says some producer is handing the store values it
      // will not take - a bug in that producer worth finding - and it is the only trace left, now
      // that the line itself goes on without them. Compared against the query-stripped path, so
      // this shipper's own rule does not read as a clamp and fire on every request line.
      const given: Record<string, unknown> = {
        level,
        event,
        requestId,
        userId,
        role,
        method,
        path: withoutQuery,
        status,
        durationMs,
      };
      if (Object.entries(envelope).some(([field, value]) => value !== given[field])) {
        this.counts.clamped += 1;
      }
      const payload = JSON.stringify({
        // The caller's own fields go in FIRST, so the envelope always wins: a line claiming
        // `service: "gateway"` or its own `ts` would make the store unreadable.
        ...safeRest,
        lineId,
        ts,
        service: this.service,
        ...envelope,
      });
      // The bounded id, not the caller's: a key the store will not hold would group one request's
      // lines in a partition under an id that never appears in the stored line.
      return { payload, key: envelope.requestId };
    } catch {
      // A fixed reason, never the exception's message: the exception came from the caller's own
      // getter, so its message is caller-controlled text and could carry the very secret the
      // field-name redaction exists to remove (PR #129 review).
      return {
        payload: JSON.stringify({
          lineId,
          ts,
          service: this.service,
          level: 'error',
          event: 'line_unserialisable',
          // Left out of the line entirely when there is no usable one, which is what the store's
          // `.optional()` means - rather than a null, which would read as "this had no request".
          requestId: originalRequestId,
          reason: 'the line could not be built',
          // Bounded like `event` itself. This is caller text on a path that exists *because* the
          // caller's object misbehaved, and the fixed `reason` beside it is fixed for that same
          // reason; shipping it unbounded would put an arbitrary amount of it on stdout and on the
          // topic (PR #129 review).
          originalEvent: originalEvent === null ? null : boundedText(originalEvent, STORE_LIMITS.event),
        }),
        // Keyed like any other line, so the failure lands in the partition already holding that
        // request's lines, in the order it happened (root AGENTS.md section 3, rule 5).
        key: originalRequestId,
      };
    }
  }

  /** Drains the buffer. Safe to call while one is already running; one publish at a time. */
  async flush(): Promise<void> {
    if (this.publishing) return this.publishing;
    if (!this.publisher || !this.buffer.length) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    // The buffer is what holds the memory; once the batch is out of it the budget is free again,
    // whether or not the publish then succeeds. Lines are never put back - they are on stdout.
    this.bufferedBytes = 0;
    const publisher = this.publisher;
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
