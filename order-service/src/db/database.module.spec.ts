/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
 * Scope: Generated the test that a dropped idle database connection can't crash the service (#137),
 *        following credit-service/src/db/database.spec.ts.
 * Author review: pending — Jie Yang to record the review.
 */
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Logger } from '@nestjs/common';
import { createPool } from './database.module';

// When PostgreSQL restarts it ends the pool's idle connections, and the pool emits 'error'. With no
// listener, Node throws it and the whole service exits.
test('logs an error from an idle connection instead of crashing', async () => {
  const error = mock.method(Logger.prototype, 'error', () => undefined);
  const pool = createPool({ host: '127.0.0.1', port: 1, database: 'orders', user: 'foc', password: 'x' });
  try {
    assert.doesNotThrow(() => pool.emit('error', new Error('terminating connection due to administrator command')));
    assert.match(String(error.mock.calls[0].arguments[0]), /terminating connection/);
  } finally {
    error.mock.restore();
    await pool.end();
  }
});
