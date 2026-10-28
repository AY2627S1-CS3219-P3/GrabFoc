/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Generated these unit tests for the parts of LinesService that are pure JavaScript - the
 *        shape of the query it builds and how it reads the result back. The behaviour against a
 *        real PostgreSQL stays in lines.service.int.spec.ts; these cover what a fake pool can see,
 *        including that a broad page no longer materialises every matching row (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */
import { Pool } from 'pg';
import { LinesService } from './lines.service';

// AI-generated (reviewed by Cole Lin).

interface Call {
  sql: string;
  params: unknown[];
}

function fakePool(rows: Record<string, unknown>[]) {
  const calls: Call[] = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows, rowCount: rows.length };
    },
  };
  return { calls, lines: new LinesService(pool as unknown as Pool) };
}

const storedRow = (overrides: Record<string, unknown> = {}) => ({
  total: '3',
  line_id: '3f1c8e9a-5b2d-4e7f-9a1b-2c3d4e5f6a7b',
  ts: new Date('2026-10-16T08:00:25.123Z'),
  received_at: new Date('2026-10-16T08:00:26.000Z'),
  service: 'supplier',
  level: 'warn',
  event: 'access_denied',
  request_id: 'trace-1',
  user_id: null,
  role: null,
  method: 'GET',
  path: '/locations',
  status: 403,
  duration_ms: 12,
  extra: null,
  ...overrides,
});

const query = { page: 1, pageSize: 50 } as const;

describe('the query it builds', () => {
  it('asks the database exactly once, so the rows and the total share one snapshot', async () => {
    const { calls, lines } = fakePool([storedRow()]);
    await lines.query({ ...query });
    expect(calls).toHaveLength(1);
  });

  /**
   * The predicate is written into both the count and the page subquery rather than into one CTE
   * they both read. A CTE referenced twice is materialised by PostgreSQL, so an unfiltered page
   * built every matching row - `extra` JSONB included - sorted the lot, and then returned fifty of
   * them; and the page branch could not stop early on the timestamp index. Two subqueries in one
   * statement still see one snapshot, which is the property the single statement was for
   * (PR #129 review).
   */
  it('filters inside both subqueries rather than in a CTE they share', async () => {
    const { calls, lines } = fakePool([storedRow()]);
    await lines.query({ ...query, service: 'supplier' });
    const occurrences = calls[0].sql.split('WHERE service = $1').length - 1;
    expect(occurrences).toBe(2);
  });

  it('reads no CTE twice', async () => {
    const { calls, lines } = fakePool([storedRow()]);
    await lines.query({ ...query });
    expect(calls[0].sql).not.toMatch(/FROM\s+filtered/);
  });

  it('passes the filters first, then the limit and the offset', async () => {
    const { calls, lines } = fakePool([storedRow()]);
    await lines.query({ ...query, page: 3, pageSize: 20, service: 'supplier', level: 'warn' });
    expect(calls[0].params).toEqual(['supplier', 'warn', 20, 40]);
  });

  it('omits the WHERE clause entirely when nothing is filtered', async () => {
    const { calls, lines } = fakePool([storedRow()]);
    await lines.query({ ...query });
    expect(calls[0].sql).not.toContain('WHERE');
    expect(calls[0].params).toEqual([50, 0]);
  });

  // status=0 is not a valid status, but `if (q.status)` would also drop a filter the caller set.
  it('keeps a status filter rather than testing it for truthiness', async () => {
    const { calls, lines } = fakePool([storedRow()]);
    await lines.query({ ...query, status: 404 });
    expect(calls[0].params).toEqual([404, 50, 0]);
  });
});

describe('the result it reads back', () => {
  it('names the columns as the API does', async () => {
    const { lines } = fakePool([storedRow()]);
    const page = await lines.query({ ...query });
    expect(page.lines[0]).toEqual({
      lineId: '3f1c8e9a-5b2d-4e7f-9a1b-2c3d4e5f6a7b',
      ts: '2026-10-16T08:00:25.123Z',
      receivedAt: '2026-10-16T08:00:26.000Z',
      service: 'supplier',
      level: 'warn',
      event: 'access_denied',
      requestId: 'trace-1',
      userId: null,
      role: null,
      method: 'GET',
      path: '/locations',
      status: 403,
      durationMs: 12,
      extra: null,
    });
    expect(page).toMatchObject({ page: 1, pageSize: 50, total: 3 });
  });

  /**
   * The LEFT JOIN always returns one row, so an empty page arrives as the total with every line
   * column NULL. That row is not a line and must not be read as one - the total still has to
   * describe the filter, or page 9 of a 3-page result would say there is nothing there at all
   * (PR #129 review).
   */
  it('reads an empty page as a total with no lines', async () => {
    const { lines } = fakePool([
      { total: '3', line_id: null, ts: null, received_at: null, service: null, level: null, event: null,
        request_id: null, user_id: null, role: null, method: null, path: null, status: null,
        duration_ms: null, extra: null },
    ]);
    const page = await lines.query({ ...query, page: 9 });
    expect(page.lines).toEqual([]);
    expect(page.total).toBe(3);
  });
});
