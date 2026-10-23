/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated these unit tests for the inbound-line envelope and the query parameters.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Added the nested-redaction and timestamp-precision cases after the PR #129 reviews.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: A line with an odd requestId is now stored rather than dropped, plus the compound-name
 *        and page-bound cases (third review round on PR #129).
 * Author review: Cole Lin, read and approved.
 */
import { inboundLineSchema, logQuerySchema, parseOr400, toRow } from './line.schema';

// AI-generated (reviewed by Cole Lin).

const valid = {
  lineId: '3f1c8e9a-5b2d-4e7f-9a1b-2c3d4e5f6a7b',
  ts: '2026-10-16T08:00:25.123Z',
  service: 'supplier',
  level: 'warn' as const,
  event: 'access_denied',
};

const parse = (line: Record<string, unknown>) => inboundLineSchema.safeParse(line);

describe('the inbound line envelope', () => {
  it('accepts the minimum a line must carry', () => {
    expect(parse(valid).success).toBe(true);
  });

  it.each([
    ['no lineId', { ...valid, lineId: undefined }],
    ['a lineId that is not a UUID', { ...valid, lineId: 'line-1' }],
    ['no service', { ...valid, service: undefined }],
    ['a level that is not one of the four', { ...valid, level: 'trace' }],
    ['no event', { ...valid, event: '' }],
    ['a status outside 100-599', { ...valid, status: 42 }],
    ['a negative duration', { ...valid, durationMs: -1 }],
    // Larger than the INTEGER column, so it used to pass here and fail at the insert.
    ['a duration past the column range', { ...valid, durationMs: 2147483648 }],
    ['a role that is not ADMIN or USER', { ...valid, role: 'COURIER' }],
  ])('rejects a line with %s', (_why, line) => {
    expect(parse(line as Record<string, unknown>).success).toBe(false);
  });

  /**
   * The store records what happened; the *service* decides what id to use. Dropping the line
   * because its id looks odd is how an access_denied event disappears from the store, which is
   * exactly what a caller sending a strange header would want (PR #129 review).
   */
  it.each(['unsafe/id', 'has space', 'trace#1', 'x'.repeat(200)])(
    'stores a line whose requestId is %s rather than dropping it',
    (requestId) => {
      expect(parse({ ...valid, requestId }).success).toBe(true);
    },
  );

  it.each([
    ['a control character', 'trace\u0007one'],
    ['over 200 characters', 'x'.repeat(201)],
  ])('still rejects a requestId with %s', (_why, requestId) => {
    expect(parse({ ...valid, requestId }).success).toBe(false);
  });

  // A timestamp without a zone cannot be compared across containers, which is the one thing a
  // pooled log store exists to do.
  it.each(['2026-10-16 08:00:25', '2026-10-16T08:00:25', '16/10/2026'])(
    'rejects %s, which is not ISO-8601 UTC',
    (ts) => {
      expect(parse({ ...valid, ts }).success).toBe(false);
    },
  );
});

describe('toRow', () => {
  it('keeps event-specific fields in extra rather than dropping them', () => {
    const row = toRow(parse({ ...valid, status: 403, orderId: 17, attempt: 2 }).data!);
    expect(row.status).toBe(403);
    expect(row.extra).toEqual({ orderId: 17, attempt: 2 });
  });

  it('leaves extra null when a line carries nothing beyond the columns', () => {
    expect(toRow(parse(valid).data!).extra).toBeNull();
  });

  // The producer is supposed to keep these out of a line; this is the second lock.
  it.each(['password', 'token', 'authorization', 'X-Service-Key', 'otp_hash', 'email'])(
    'never stores a field called %s',
    (field) => {
      const row = toRow(parse({ ...valid, [field]: 'should-not-be-stored' }).data!);
      expect(JSON.stringify(row)).not.toContain('should-not-be-stored');
    },
  );

  // A nested secret is exactly as queryable as a top-level one once it is in `extra`.
  it('replaces a sensitive field nested inside an object', () => {
    const row = toRow(parse({ ...valid, request: { headers: { authorization: 'Bearer leak-me' } } }).data!);
    expect(JSON.stringify(row)).not.toContain('leak-me');
    expect(JSON.stringify(row)).toContain('[REDACTED]');
  });

  it('replaces a sensitive field nested inside an array', () => {
    const row = toRow(parse({ ...valid, items: [{ ok: 1 }, { token: 'leak-me' }] }).data!);
    expect(JSON.stringify(row)).not.toContain('leak-me');
  });

  it('keeps the rest of a nested object', () => {
    const row = toRow(parse({ ...valid, request: { retries: 2, password: 'leak-me' } }).data!);
    expect((row.extra as { request: { retries: number } }).request.retries).toBe(2);
  });

  it('truncates past the depth limit rather than storing what is down there', () => {
    let nested: unknown = { token: 'leak-me' };
    for (let i = 0; i < 9; i += 1) nested = { next: nested };
    const row = toRow(parse({ ...valid, nested: nested as Record<string, unknown> }).data!);
    expect(JSON.stringify(row)).not.toContain('leak-me');
    expect(JSON.stringify(row)).toContain('[TRUNCATED]');
  });

  // Listing every compound anyone might invent is not possible, so the match is a substring.
  it.each(['adminToken', 'passwordResetToken', 'apiSecret', 'customerEmail', 'userEmailAddress'])(
    'never stores a compound field called %s',
    (field) => {
      const row = toRow(parse({ ...valid, [field]: 'leak-me' }).data!);
      expect(JSON.stringify(row)).not.toContain('leak-me');
    },
  );

  it('cuts the path at the query string, so coordinates cannot be stored', () => {
    const row = toRow(parse({ ...valid, path: '/locations?lat=1.2966&lon=103.7764' }).data!);
    expect(row.path).toBe('/locations');
    expect(JSON.stringify(row)).not.toContain('103.7764');
  });
});

describe('the query parameters', () => {
  it('defaults to the first page of 50', () => {
    expect(logQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 50 });
  });

  it('rejects an unknown filter rather than ignoring it', () => {
    expect(logQuerySchema.safeParse({ serivce: 'supplier' }).success).toBe(false);
  });

  // The same instant written with and without milliseconds sorts the wrong way round as text.
  it('accepts a range whose ends differ only in precision', () => {
    const result = logQuerySchema.safeParse({
      from: '2026-10-16T08:00:00Z',
      to: '2026-10-16T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a time range that runs backwards', () => {
    const result = logQuerySchema.safeParse({
      from: '2026-10-16T10:00:00.000Z',
      to: '2026-10-16T09:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  // page=1e20 passes an unbounded integer check and then overflows PostgreSQL's OFFSET.
  it.each(['1e20', '1000001', '999999999999'])('rejects page=%s rather than failing in SQL', (page) => {
    expect(logQuerySchema.safeParse({ page }).success).toBe(false);
  });

  it('caps pageSize, so one query cannot ask for everything', () => {
    expect(logQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('names the invalid parameter in the 400', () => {
    expect(() => parseOr400(logQuerySchema, { page: '0' }, 'query parameters')).toThrow(/page/);
  });
});
