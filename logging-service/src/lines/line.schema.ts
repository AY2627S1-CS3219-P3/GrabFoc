/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the Zod schemas for an inbound log line and for the query parameters, from the
 *        field convention Cole Lin posted on issue #52 and the plan he approved on 2026-10-16.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: After the reviews of PR #129: redact sensitive field names at any depth, not only at
 *        the top level, and compare the from/to range as instants rather than as text.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Truncate beyond the depth limit instead of returning the subtree (PR #130 review).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: After the third review round on PR #129: store a line whose requestId does not match
 *        the service-side pattern rather than dropping it, match sensitive names as substrings,
 *        and bound `page` so an offset cannot overflow the database.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
 * Scope: After the seventh review round on PR #129: sanitise field *names* as well as
 *        values, and let the requestId filter accept every id the store accepts.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
 * Scope: A field named `__proto__` is no longer lost, and personal names - display, given and
 *        family names, and `phone` - are redacted (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Refuse a control character in `method` and `path` here, rather than accepting the line
 *        and letting the insert fail on it (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */
import { z } from 'zod';
import { ProblemException } from '../common/problem';

// AI-generated (reviewed by Cole Lin).

/** Fields the table has a column for. Anything else a line carries goes to `extra`. */
export const KNOWN_FIELDS = [
  'lineId',
  'ts',
  'service',
  'level',
  'event',
  'requestId',
  'userId',
  'role',
  'method',
  'path',
  'status',
  'durationMs',
] as const;

/**
 * Field names whose values must never be stored, matched case-insensitively and ignoring `-` and
 * `_`. The producer is supposed to keep these out of a line in the first place (root AGENTS.md);
 * this is the second lock, because a line that reaches here is already past review.
 * Adapted from user-service/src/common/logger.ts.
 */
const NEVER_STORE = [
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
  'mobile',
  'mobilenumber',
  // Personal data rather than credentials, and just as unstorable: a display name identifies a
  // student on sight, and `phone` sat outside `mobile` (root AGENTS.md: never log unmasked
  // personal data). The same names are in the shipper's list (PR #129 review).
  'phone',
  'displayname',
  'fullname',
  'firstname',
  'lastname',
  'balance',
  'credits',
];

/** A substring match, so `adminToken` and `customerEmail` are caught too (PR #129 review). */
function neverStore(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[-_]/g, '');
  return NEVER_STORE.some((name) => normalised.includes(name));
}

/**
 * PostgreSQL cannot hold a control character in a TEXT column: a NUL in a parameter is refused
 * outright. So this is not only about readability. `?service=%00` reached the query and came back
 * as a 500 for input that should have been a 400, and on the inbound side a NUL reached the INSERT
 * and failed it with a class-22 SQLSTATE - which ingest reads as permanently unstorable and parks,
 * for a line this schema had just called valid (PR #129 review). Written as a loop rather than a
 * regex so the escape sequences cannot be mangled by an editing tool.
 */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

const noControl = (schema: z.ZodString) =>
  schema.refine((v) => !hasControlChars(v), 'must not contain control characters');

const plainText = (max: number) => noControl(z.string().min(1).max(max));
/**
 * `plainText` without the minimum length. Only `path` needs it: the shipper strips control
 * characters from a path, so one made of nothing but them arrives as `''`, and `toRow` turns that
 * into NULL. Requiring a character here would cost the whole line instead (PR #129 review).
 */
const plainTextOrEmpty = (max: number) => noControl(z.string().max(max));

/**
 * The envelope every service produces. This is the one schema in the project that is not
 * `.strict()`: a log line's unknown fields are the point — they are what the event was about — so
 * they are kept rather than rejected. They are split off into `extra` by `toRow` below.
 */
export const inboundLineSchema = z
  .object({
    lineId: z.string().uuid(),
    // ISO-8601 with a Z offset. Zod's .datetime() rejects a local-time string, which is what we
    // want: a timestamp without a zone cannot be compared across containers.
    ts: z.string().datetime(),
    service: plainText(40),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    event: plainText(60),
    /**
     * Deliberately laxer than the pattern a service applies to an inbound header. A service
     * decides what id to *use*; this store records what happened. Rejecting the line because its
     * id looks odd means an `access_denied` event disappears from the store, which is exactly the
     * record a caller sending a strange header would want gone (PR #129 review). Control
     * characters are excluded because they would break a line-oriented reader.
     */
    requestId: plainText(200).optional(),
    // The same control-character rule the query filter applies. Hardening only the filter left a
    // line whose userId holds a tab storable and then unsearchable through the very filter an
    // admin would reach for - and the odd row is the one they are looking for (PR #129 review).
    userId: plainText(100).optional(),
    role: z.enum(['ADMIN', 'USER']).optional(),
    // These two were the only text fields left as a bare `z.string()`, so a control character
    // passed validation and then failed the insert - the same defect the `durationMs` bound below
    // was added to fix. `method` comes from the request line and `path` from the URL, so both are
    // caller-controlled: a line this schema calls valid has to be a line the columns can hold, or
    // one `access_denied` event is parked instead of stored (PR #129 review).
    method: plainText(10).optional(),
    path: plainTextOrEmpty(400).optional(),
    status: z.number().int().min(100).max(599).optional(),
    // The column is INTEGER, so a larger value passed validation and then failed the insert with
    // SQLSTATE 22003 - which ingest reads as permanently unstorable and dead-letters, for a line
    // this schema had just called valid (PR #129 review).
    durationMs: z.number().int().min(0).max(2147483647).optional(),
  })
  .passthrough();

export type InboundLine = z.infer<typeof inboundLineSchema>;

export interface LineRow {
  lineId: string;
  ts: string;
  service: string;
  level: string;
  event: string;
  requestId: string | null;
  userId: string | null;
  role: string | null;
  method: string | null;
  path: string | null;
  status: number | null;
  durationMs: number | null;
  extra: Record<string, unknown> | null;
}

const REDACTED = '[REDACTED]';
// A field name a producer would plausibly write. A key is as caller-controlled as a value, and
// redaction only ever looked at values - so `{ recipients: { "alice@nus.edu.sg": true } }` put an
// address in the `extra` column with nothing flagged (PR #129 review). An unsafe name is replaced
// whole rather than truncated, since half an address or half a token is still half too much. The
// same rule lives in the shipper and in the dead-letter shape; the three must agree.
const SAFE_KEY = /^[A-Za-z0-9_.:-]{1,64}$/;

function safeKey(key: string, index: number): string {
  // `__proto__` passes the pattern but is never a usable field name: assigning it to an ordinary
  // object runs Object.prototype's setter instead of defining a property, and the field is lost.
  // The objects built below have null prototypes, so nothing is lost there - but the store's
  // inbound schema builds its own object through Zod, which does drop that name, so it is
  // replaced here rather than shipped and the two sides cannot disagree (PR #129 review).
  return SAFE_KEY.test(key) && key !== '__proto__' ? key : `[key ${index}: ${key.length} chars]`;
}
const TRUNCATED = '[TRUNCATED]';
const MAX_DEPTH = 6;

/**
 * A copy of `value` with every sensitive field replaced, at any depth. A nested secret —
 * `{ request: { headers: { authorization: … } } }` — is exactly as queryable as a top-level one
 * once it is in the `extra` column, so dropping only the outer keys is not enough (PR #129 review).
 */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  // Replaced rather than returned, for the same reasons as in the shipper: a secret nested deeper
  // than this would be stored verbatim, and a cycle would reach the JSON serialiser (PR #130).
  if (depth > MAX_DEPTH) return TRUNCATED;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1));
  // Null-prototype, so a field name can only ever define a property on this object. `__proto__`
  // is the one name for which `out[key] = item` does something else - it runs Object.prototype's
  // setter - and the field was then missing from the stored row with its neighbours intact
  // (PR #129 review). `safeKey` replaces that name too; this is what makes the loss structurally
  // impossible rather than dependent on the list staying right.
  const out: Record<string, unknown> = Object.create(null);
  Object.entries(value as Record<string, unknown>).forEach(([key, item], index) => {
    if (typeof item === 'function') return;
    out[safeKey(key, index)] = neverStore(key) ? REDACTED : redactDeep(item, depth + 1);
  });
  return out;
}

/** Everything the columns don't cover, with the names that must never be stored replaced. */
function extraOf(line: InboundLine): Record<string, unknown> | null {
  const known = new Set<string>(KNOWN_FIELDS);
  // Null-prototype, for the same reason as in redactDeep above.
  const extra: Record<string, unknown> = Object.create(null);
  Object.entries(line).forEach(([key, value], index) => {
    if (known.has(key)) return;
    extra[safeKey(key, index)] = neverStore(key) ? REDACTED : redactDeep(value);
  });
  return Object.keys(extra).length ? extra : null;
}

/**
 * A validated line as a row. `path` is cut at the first `?`: the producer is supposed to send the
 * pathname only, because a query string can carry the caller's coordinates, and this store is the
 * last place that should hold them (see supplier-service PR #90).
 */
export function toRow(line: InboundLine): LineRow {
  const path = line.path?.split('?')[0];
  return {
    lineId: line.lineId,
    ts: line.ts,
    service: line.service,
    level: line.level,
    event: line.event,
    requestId: line.requestId ?? null,
    userId: line.userId ?? null,
    role: line.role ?? null,
    method: line.method ?? null,
    path: path === undefined || path === '' ? null : path,
    status: line.status ?? null,
    durationMs: line.durationMs ?? null,
    extra: extraOf(line),
  };
}

// Bounded, so (page - 1) * pageSize cannot exceed PostgreSQL's OFFSET range: page=1e20 passes an
// unbounded integer check and then fails in the database as a 500 (PR #129 review).
const MAX_PAGE = 1_000_000;
const positiveInt = z.coerce.number().int().positive();

/** Query parameters for GET /logs. Strict: an unknown filter is a typo, not a wildcard. */
export const logQuerySchema = z
  .object({
    // The same rule the inbound schema applies, deliberately: that one is lax on purpose, so a
    // line whose id looks odd is still recorded - and an id that can be stored has to be
    // searchable, or the one record an admin is looking for is the one they cannot reach
    // (PR #129 review).
    requestId: plainText(200).optional(),
    service: plainText(40).optional(),
    event: plainText(60).optional(),
    userId: plainText(100).optional(),
    level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    status: z.coerce.number().int().min(100).max(599).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: positiveInt.max(MAX_PAGE).default(1),
    pageSize: positiveInt.max(200).default(50),
  })
  .strict()
  // Compared as instants, not as text: 08:00:00Z and 08:00:00.000Z are the same moment but sort
  // the wrong way round as strings (PR #129 review).
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
    message: 'from must not be after to',
    path: ['from'],
  });

export type LogQuery = z.infer<typeof logQuerySchema>;

/** Parse with a Zod schema, or throw a 400 Problem Details response naming the invalid fields. */
export function parseOr400<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown, what: string): T {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const issues = result.error.issues
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
  throw new ProblemException(400, `Invalid ${what}: ${issues}`);
}
