/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the Zod schemas for an inbound log line and for the query parameters, from the
 *        field convention Cole Lin posted on issue #52 and the plan he approved on 2026-10-16.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { z } from 'zod';
import { ProblemException } from '../common/problem';

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

/** Everything the columns don't cover, with the names that must never be stored dropped. */
function extraOf(line: InboundLine): Record<string, unknown> | null {
  const known = new Set<string>(KNOWN_FIELDS);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(line)) {
    if (known.has(key) || neverStore(key)) continue;
    extra[key] = value;
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
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
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
