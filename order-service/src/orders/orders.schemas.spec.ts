/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated unit tests for the paging query schema.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PageQuery } from './orders.schemas';

test('PageQuery defaults to page 1 of 20 and coerces query strings', () => {
  assert.deepEqual(PageQuery.parse({}), { page: 1, pageSize: 20 });
  assert.deepEqual(PageQuery.parse({ page: '3', pageSize: '100' }), { page: 3, pageSize: 100 });
});

test('PageQuery rejects out-of-range, non-integer and unknown parameters', () => {
  for (const query of [{ page: '0' }, { pageSize: '101' }, { page: '1.5' }, { page: 'x' }, { status: 'PENDING' }]) {
    assert.equal(PageQuery.safeParse(query).success, false, JSON.stringify(query));
  }
});
