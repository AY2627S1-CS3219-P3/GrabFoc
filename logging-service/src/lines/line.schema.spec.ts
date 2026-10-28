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
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Added the control-character cases for method and path, the two fields that passed
 *        validation and then failed the insert (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Added the cases for what JSONB cannot hold inside `extra`, and for an Array subclass
 *        surviving the redaction walk (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Added the year-zero cases: an ISO year PostgreSQL has no room for (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */
import { inboundLineSchema, logQuerySchema, parseOr400, redactDeep, toRow } from './line.schema';

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
  /**
   * `method` and `path` were the only two text fields left as a bare `z.string()`: every other one
   * goes through `plainText`, which refuses control characters. So a NUL in a path passed this
   * schema and then failed the INSERT with a class-22 SQLSTATE, which ingest reads as permanently
   * unstorable and parks - for a line this schema had just called valid. That is the same defect
   * the `durationMs` bound above was added to fix (PR #129 review).
   */
  it.each<[string, number]>([
    ['a NUL', 0],
    ['a tab', 9],
    ['a newline', 10],
    ['a DEL', 0x7f],
  ])('rejects %s in path here rather than at the insert', (_why, code) => {
    expect(parse({ ...valid, path: `/locations${String.fromCharCode(code)}` }).success).toBe(false);
  });

  it.each<[string, number]>([
    ['a NUL', 0],
    ['a tab', 9],
  ])('rejects %s in method here rather than at the insert', (_why, code) => {
    expect(parse({ ...valid, method: `GET${String.fromCharCode(code)}` }).success).toBe(false);
  });

  /**
   * The guard above must not cost the empty path. The shipper strips control characters from
   * `path`, so a path of nothing but control characters arrives as `''` - and `toRow` turns that
   * into NULL. Requiring at least one character here would reject the whole line instead.
   */
  it('still accepts an empty path', () => {
    expect(parse({ ...valid, path: '' }).success).toBe(true);
  });

  it('still accepts an ordinary method and path', () => {
    expect(parse({ ...valid, method: 'PATCH', path: '/locations/3f1c8e9a' }).success).toBe(true);
  });

});

describe('toRow', () => {
  it('keeps event-specific fields in extra rather than dropping them', () => {
    const row = toRow(parse({ ...valid, status: 403, orderId: 17, attempt: 2 }).data!);
    expect(row.status).toBe(403);
    expect(row.extra).toEqual({ orderId: 17, attempt: 2 });
  });

  /**
   * Redaction only ever looked at values, so data used as a *key* reached the `extra` column
   * untouched: `{ recipients: { "alice@nus.edu.sg": true } }` stored an address (PR #129 review).
   */
  it('replaces a field name that cannot be a real field name', () => {
    const row = toRow(parse({ ...valid, recipients: { 'alice@nus.edu.sg': true } }).data!);
    const extra = row.extra as { recipients: Record<string, unknown> };
    expect(JSON.stringify(extra)).not.toContain('alice@nus.edu.sg');
    expect(Object.keys(extra.recipients)[0]).toMatch(/^\[key \d+: \d+ chars\]$/);
    // The value under it is harmless and still useful.
    expect(Object.values(extra.recipients)[0]).toBe(true);
  });

  it('replaces a top-level field name that is really data', () => {
    const row = toRow(parse({ ...valid, 'alice@nus.edu.sg': 'x' }).data!);
    expect(JSON.stringify(row.extra)).not.toContain('alice@nus.edu.sg');
  });

  /**
   * `extra['__proto__'] = value` runs Object.prototype's setter instead of defining a property, so
   * a field with that name vanished from the stored row while its neighbours were kept - the worst
   * way to lose one from a record an admin queries for audit (PR #129 review).
   */
  it('keeps the value of a field named __proto__, under a replaced name', () => {
    // Through JSON.parse: writing `__proto__` in a literal sets the prototype, not a field.
    const row = toRow(parse({ ...valid, ...JSON.parse('{"wrapper":{"__proto__":"kept","keep":1}}') }).data!);
    const wrapper = (row.extra as { wrapper: Record<string, unknown> }).wrapper;
    expect(Object.values(wrapper)).toContain('kept');
    expect(wrapper.keep).toBe(1);
    // Replaced, not kept: the inbound schema builds its own object through Zod, which drops that
    // name outright, so a producer must never be told the name itself survives.
    expect(Object.keys(wrapper)).not.toContain('__proto__');
  });

  it('keeps ordinary field names, including the punctuation a producer uses', () => {
    const row = toRow(parse({ ...valid, orderId: 17, 'req.path': '/x', 'x-source': 'kafka' }).data!);
    expect(row.extra).toEqual({ orderId: 17, 'req.path': '/x', 'x-source': 'kafka' });
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

  // Personal data rather than credentials, which is all the list covered (PR #129 review).
  it.each(['displayName', 'display_name', 'fullName', 'firstName', 'lastName', 'phone', 'phoneNumber'])(
    'never stores a personal field called %s',
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

  // PostgreSQL cannot hold a NUL in a TEXT parameter, so this used to reach the query and 500.
  it.each(['service', 'event', 'userId'])('rejects a NUL byte in the %s filter', (field) => {
    expect(logQuerySchema.safeParse({ [field]: `a${String.fromCharCode(0)}b` }).success).toBe(false);
  });

  /**
   * The inbound schema is lax on purpose, so a line whose id looks odd is still recorded. The
   * filter was stricter, so exactly those records could not be searched for - the id an admin is
   * most likely to be chasing is the strange one (PR #129 review).
   */
  it.each(['trace+1', 'a'.repeat(150), 'trace 1', 'trace/1'])(
    'accepts the stored request id %#, because the store accepted it',
    (id) => {
      expect(inboundLineSchema.safeParse({ ...valid, requestId: id }).success).toBe(true);
      expect(logQuerySchema.safeParse({ requestId: id }).success).toBe(true);
    },
  );

  /**
   * The filter and the store have to agree about what a text field may hold. Hardening only the
   * filter left a line whose userId holds a tab storable and then unsearchable through the very
   * filter an admin would reach for (PR #129 review).
   */
  it.each(['service', 'event', 'userId', 'requestId'])(
    'rejects a control byte in the inbound %s, so nothing stored is unsearchable',
    (field) => {
      const line = { ...valid, [field]: `a${String.fromCharCode(9)}b` };
      expect(inboundLineSchema.safeParse(line).success).toBe(false);
      expect(logQuerySchema.safeParse({ [field]: `a${String.fromCharCode(9)}b` }).success).toBe(false);
    },
  );

  it.each(['service', 'event', 'userId', 'requestId'])(
    'accepts the same ordinary %s on both sides',
    (field) => {
      expect(inboundLineSchema.safeParse({ ...valid, [field]: 'u-123' }).success).toBe(true);
      expect(logQuerySchema.safeParse({ [field]: 'u-123' }).success).toBe(true);
    },
  );

  it.each(['service', 'event', 'userId', 'requestId'])(
    'rejects a control byte in the %s filter',
    (field) => {
      expect(logQuerySchema.safeParse({ [field]: `a${String.fromCharCode(31)}b` }).success).toBe(false);
    },
  );

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

describe('what JSONB cannot hold', () => {
  /**
   * The round before brought `method` and `path` inside what their TEXT columns accept. This is the
   * same defect one level down: `extra` is JSONB, and PostgreSQL's JSONB cannot represent a NUL or
   * an unpaired surrogate at all - it refuses the value with a class-22 error, which ingest reads
   * as permanently unstorable and parks. So a line with `{ note: "a\u0000b" }` was accepted here
   * and then lost, which is the outcome this pairing exists to prevent (PR #129 review).
   *
   * Removed rather than rejected, deliberately, and the other way round from the envelope fields:
   * `extra` is free-form metadata, so a tab or a newline in a `note` is content and is kept. Only
   * what JSONB cannot carry is taken out, and taking it out costs that character where rejecting
   * would cost the whole line.
   */
  it.each([
    ['a NUL', `a${'\u0000'}b`, 'ab'],
    ['an unpaired high surrogate', `a${'\ud800'}b`, 'ab'],
    ['a lone low surrogate', 'a\udc00b', 'ab'],
  ])('removes %s from an extra value', (_why, note, expected) => {
    expect(toRow({ ...valid, note } as never).extra).toEqual({ note: expected });
  });

  it('keeps a valid surrogate pair, which JSONB can hold', () => {
    expect(toRow({ ...valid, note: 'a\ud83d\ude00b' } as never).extra).toEqual({ note: 'a\ud83d\ude00b' });
  });

  it('keeps a tab and a newline, which are content in free-form metadata', () => {
    expect(toRow({ ...valid, note: 'a\tb\nc' } as never).extra).toEqual({ note: 'a\tb\nc' });
  });

  it('removes them at any depth, and inside an array', () => {
    const row = toRow({ ...valid, ctx: { deep: [`x${'\u0000'}y`] } } as never);
    expect(row.extra).toEqual({ ctx: { deep: ['xy'] } });
  });

  it('serialises the result, which is what the insert actually sends', () => {
    const row = toRow({ ...valid, note: `a${'\u0000'}b` } as never);
    expect(JSON.stringify(row.extra)).not.toContain('\\u0000');
  });
});

describe('an Array subclass in the metadata', () => {
  /**
   * `Array.prototype.map` goes through `Symbol.species`, so mapping a subclass returned another
   * instance of that subclass - prototype and all - and `JSON.stringify` then called its inherited
   * `toJSON` *after* redaction had finished, free to return anything. Dropping own function values
   * does not help: a class puts `toJSON` on the prototype, where `Object.entries` never looks
   * (PR #129 review). Unreachable from the ingest path, where every value came from `JSON.parse`,
   * but `redactDeep` is exported and has to hold on its own.
   */
  class Sneaky extends Array {
    toJSON() {
      return 'password=hunter2';
    }
  }

  const sneaky = () => {
    const out = new Sneaky();
    out.push('a');
    return out;
  };

  it('does not let an inherited toJSON run after redaction', () => {
    expect(JSON.stringify(redactDeep({ items: sneaky() }))).not.toContain('hunter2');
  });

  it('rebuilds it as a plain array', () => {
    const out = redactDeep({ items: sneaky() }) as { items: unknown[] };
    expect(Array.isArray(out.items)).toBe(true);
    expect(out.items.constructor).toBe(Array);
    expect(out.items).toEqual(['a']);
  });
});

/**
 * `.datetime()` takes a four-digit year, and `0000` is a valid ISO one - but PostgreSQL's calendar
 * has no year zero, so it refuses the parameter with a class-22 SQLSTATE. On the query side that
 * reached the generic 500 path for input that should have been a 400; on the inbound side it cost
 * the whole line, because ingest reads a class-22 failure as permanently unstorable and parks it.
 * Both sides of the same pairing, as with `method` and `path` (PR #129 review).
 */
describe('a year PostgreSQL has no room for', () => {
  it.each(['from', 'to'])('rejects %s in year zero rather than failing in SQL', (field) => {
    expect(logQuerySchema.safeParse({ [field]: '0000-01-01T00:00:00.000Z' }).success).toBe(false);
  });

  it('names the parameter in the 400', () => {
    expect(() => parseOr400(logQuerySchema, { from: '0000-06-01T00:00:00.000Z' }, 'query parameters')).toThrow(
      /from/,
    );
  });

  it('rejects an inbound line dated year zero', () => {
    expect(parse({ ...valid, ts: '0000-01-01T00:00:00.000Z' }).success).toBe(false);
  });

  it.each(['0001-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z'])('still accepts %s', (ts) => {
    expect(parse({ ...valid, ts }).success).toBe(true);
    expect(logQuerySchema.safeParse({ from: ts }).success).toBe(true);
  });
});
