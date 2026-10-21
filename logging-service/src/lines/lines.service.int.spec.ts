/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated these integration tests against a real PostgreSQL (logging_test in the
 *        logging-db container): insert, deduplication, the query filters, paging and the purge.
 * Author review: Cole Lin, read and approved.
 */
import { Pool } from 'pg';
import { emptyLines, openTestDatabase } from '../test/database';
import { inboundLineSchema, toRow } from './line.schema';
import { LinesService } from './lines.service';

// AI-generated (reviewed by Cole Lin).

let pool: Pool;
let lines: LinesService;

beforeAll(async () => {
  pool = await openTestDatabase();
  lines = new LinesService(pool);
});
afterAll(() => pool.end());
beforeEach(() => emptyLines(pool));

let counter = 0;
/** A line as a service would produce it. `id` only has to differ, so the tests stay readable. */
function line(overrides: Record<string, unknown> = {}): ReturnType<typeof toRow> {
  counter += 1;
  const parsed = inboundLineSchema.safeParse({
    lineId: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    ts: '2026-10-16T08:00:25.123Z',
    service: 'supplier',
    level: 'warn',
    event: 'access_denied',
    ...overrides,
  });
  if (!parsed.success) throw new Error(`test line is invalid: ${parsed.error.message}`);
  return toRow(parsed.data);
}

describe('storing a line', () => {
  it('stores it and reads it back unchanged', async () => {
    const row = line({ requestId: 'trace-1', userId: 'u-9', role: 'USER', method: 'POST', path: '/locations', status: 403 });
    expect(await lines.insert(row)).toBe(true);

    const { lines: stored, total } = await lines.query({ page: 1, pageSize: 50 });
    expect(total).toBe(1);
    expect(stored[0]).toMatchObject({
      lineId: row.lineId,
      ts: '2026-10-16T08:00:25.123Z',
      service: 'supplier',
      event: 'access_denied',
      requestId: 'trace-1',
      userId: 'u-9',
      role: 'USER',
      status: 403,
    });
  });

  it('records when it arrived, so broker lag is visible', async () => {
    await lines.insert(line());
    const { lines: stored } = await lines.query({ page: 1, pageSize: 50 });
    expect(Date.parse(stored[0].receivedAt)).toBeGreaterThan(Date.parse(stored[0].ts));
  });

  it('keeps event-specific fields in extra', async () => {
    await lines.insert(line({ orderId: 17, attempt: 2 }));
    const { lines: stored } = await lines.query({ page: 1, pageSize: 50 });
    expect(stored[0].extra).toEqual({ orderId: 17, attempt: 2 });
  });

  // Kafka delivers at least once, so this is the case that keeps the counts honest.
  it('ignores a redelivered line instead of storing it twice', async () => {
    const row = line();
    expect(await lines.insert(row)).toBe(true);
    expect(await lines.insert(row)).toBe(false);
    expect((await lines.query({ page: 1, pageSize: 50 })).total).toBe(1);
  });

  it('rejects a line whose role is not one we issue', async () => {
    await expect(
      lines.insert({ ...line(), role: 'COURIER' }),
    ).rejects.toThrow(/log_lines_role_check/);
  });
});

describe('querying', () => {
  // What the whole service is for: one request, two services, one answer.
  it('follows one request across services', async () => {
    await lines.insert(line({ requestId: 'trace-1', service: 'gateway', event: 'request_completed', level: 'info', status: 403 }));
    await lines.insert(line({ requestId: 'trace-1', service: 'supplier', status: 403 }));
    await lines.insert(line({ requestId: 'trace-2', service: 'supplier' }));

    const { lines: stored, total } = await lines.query({ requestId: 'trace-1', page: 1, pageSize: 50 });
    expect(total).toBe(2);
    expect(stored.map((l) => l.service).sort()).toEqual(['gateway', 'supplier']);
  });

  it.each([
    ['service', { service: 'credit' }, 1],
    ['event', { event: 'unhandled_error' }, 1],
    ['userId', { userId: 'u-9' }, 1],
    ['level', { level: 'error' as const }, 1],
    ['status', { status: 500 }, 1],
  ])('filters by %s', async (_what, filter, expected) => {
    await lines.insert(line({ userId: 'u-1' }));
    await lines.insert(line({ service: 'credit', event: 'unhandled_error', level: 'error', status: 500, userId: 'u-9' }));
    expect((await lines.query({ ...filter, page: 1, pageSize: 50 })).total).toBe(expected);
  });

  it('filters by a time range, inclusive at both ends', async () => {
    await lines.insert(line({ ts: '2026-10-14T00:00:00.000Z' }));
    await lines.insert(line({ ts: '2026-10-15T00:00:00.000Z' }));
    await lines.insert(line({ ts: '2026-10-16T00:00:00.000Z' }));

    const { total } = await lines.query({
      from: '2026-10-15T00:00:00.000Z',
      to: '2026-10-16T00:00:00.000Z',
      page: 1,
      pageSize: 50,
    });
    expect(total).toBe(2);
  });

  it('returns the newest first and pages without repeating a line', async () => {
    for (const day of ['14', '15', '16']) {
      await lines.insert(line({ ts: `2026-10-${day}T00:00:00.000Z` }));
    }
    const first = await lines.query({ page: 1, pageSize: 2 });
    const second = await lines.query({ page: 2, pageSize: 2 });

    expect(first.lines.map((l) => l.ts)).toEqual(['2026-10-16T00:00:00.000Z', '2026-10-15T00:00:00.000Z']);
    expect(second.lines.map((l) => l.ts)).toEqual(['2026-10-14T00:00:00.000Z']);
    expect(first.total).toBe(3);
  });

  it('orders lines sharing a timestamp consistently, so a page boundary is stable', async () => {
    for (let i = 0; i < 4; i += 1) await lines.insert(line());
    const first = await lines.query({ page: 1, pageSize: 2 });
    const second = await lines.query({ page: 2, pageSize: 2 });
    const ids = [...first.lines, ...second.lines].map((l) => l.lineId);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('the retention purge', () => {
  it('deletes what is past the window and keeps the rest', async () => {
    const old = new Date(Date.now() - 31 * 24 * 3600_000).toISOString();
    const recent = new Date(Date.now() - 24 * 3600_000).toISOString();
    await lines.insert(line({ ts: old }));
    await lines.insert(line({ ts: recent }));

    expect(await lines.purge(30)).toBe(1);
    const { lines: left, total } = await lines.query({ page: 1, pageSize: 50 });
    expect(total).toBe(1);
    expect(left[0].ts).toBe(recent);
  });

  it('deletes nothing when everything is inside the window', async () => {
    await lines.insert(line({ ts: new Date().toISOString() }));
    expect(await lines.purge(30)).toBe(0);
  });
});
