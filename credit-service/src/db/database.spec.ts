/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated a test that an unreachable database fails fast, so the Kafka consumer's
 *        pause-and-retry runs instead of hanging (Phase 2 review finding).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Added a test that a dropped idle database connection can't crash the service.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
 * Author review: Jian Bing supplied what it states; the wording is Claude's.
 */
import { Logger } from '@nestjs/common';
import { createPool } from './database';

// 192.0.2.1 is TEST-NET-1 (RFC 5737): never routed, so a connection attempt hangs rather than
// being refused, like a database cut off by a network partition or a cloud failover.
it('fails a query to an unreachable database within seconds instead of hanging', async () => {
  const pool = createPool('postgres://foc:x@192.0.2.1:5432/credit');
  const started = Date.now();
  try {
    await expect(pool.query('SELECT 1')).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(10_000);
  } finally {
    await pool.end();
  }
}, 15_000);

// When PostgreSQL restarts it ends the pool's idle connections, and the pool emits 'error'. With no
// listener, Node throws it and the whole service exits (found while testing a database restart).
it('logs an error from an idle connection instead of crashing', async () => {
  const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  const pool = createPool('postgres://foc:x@127.0.0.1:1/credit');
  try {
    expect(() => pool.emit('error', new Error('terminating connection due to administrator command'))).not.toThrow();
    expect(String(error.mock.calls[0][0])).toMatch(/terminating connection/);
  } finally {
    error.mockRestore();
    await pool.end();
  }
});
