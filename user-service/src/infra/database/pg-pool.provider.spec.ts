/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
 * Scope: Generated the test that a dropped idle database connection can't crash the service (#137),
 *        following credit-service/src/db/database.spec.ts.
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (review pending)
import { Logger } from '@nestjs/common';
import { afterEach, expect, it, vi } from 'vitest';
import { createPool } from './pg-pool.provider';

afterEach(() => {
  vi.restoreAllMocks();
});

// When PostgreSQL restarts it ends the pool's idle connections, and the pool emits 'error'. With no
// listener, Node throws it and the whole service exits.
it('logs an error from an idle connection instead of crashing', async () => {
  const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  const pool = createPool('postgres://foc:x@127.0.0.1:1/users');
  try {
    expect(() => pool.emit('error', new Error('terminating connection due to administrator command'))).not.toThrow();
    expect(String(error.mock.calls[0][0])).toMatch(/terminating connection/);
  } finally {
    await pool.end();
  }
});
