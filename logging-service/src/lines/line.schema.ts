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
  'balance',
  'credits',
];

function neverStore(key: string): boolean {
  return NEVER_STORE.includes(key.toLowerCase().replace(/[-_]/g, ''));
}

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
    service: z.string().min(1).max(40),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    event: z.string().min(1).max(60),
    requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
    userId: z.string().min(1).max(100).optional(),
    role: z.enum(['ADMIN', 'USER']).optional(),
    method: z.string().min(1).max(10).optional(),
    path: z.string().max(400).optional(),
    status: z.number().int().min(100).max(599).optional(),
    durationMs: z.number().int().min(0).optional(),
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
const TRUNCATED = '[TRUNCATED]';
const MAX_DEPTH = 6;

/**
 * A copy of `value` with every sensitive field replaced, at any depth. A nested secret —
 * `{ request: { headers: { authorization: … } } }` — is exactly as queryable as a top-level one
 * once it is in the `extra` column, so dropping only the outer keys is not enough (PR #129 review).
 */
function redactDeep(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  // Replaced rather than returned, for the same reasons as in the shipper: a secret nested deeper
  // than this would be stored verbatim, and a cycle would reach the JSON serialiser (PR #130).
  if (depth > MAX_DEPTH) return TRUNCATED;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'function') continue;
    out[key] = neverStore(key) ? REDACTED : redactDeep(item, depth + 1);
  }
  return out;
}

/** Everything the columns don't cover, with the names that must never be stored replaced. */
function extraOf(line: InboundLine): Record<string, unknown> | null {
  const known = new Set<string>(KNOWN_FIELDS);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(line)) {
    if (known.has(key)) continue;
    extra[key] = neverStore(key) ? REDACTED : redactDeep(value);
  }
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

const positiveInt = z.coerce.number().int().positive();

/** Query parameters for GET /logs. Strict: an unknown filter is a typo, not a wildcard. */
export const logQuerySchema = z
  .object({
    requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
    service: z.string().min(1).max(40).optional(),
    event: z.string().min(1).max(60).optional(),
    userId: z.string().min(1).max(100).optional(),
    level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    status: z.coerce.number().int().min(100).max(599).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: positiveInt.default(1),
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
