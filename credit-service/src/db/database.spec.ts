/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated a test that an unreachable database fails fast, so the Kafka consumer's
 *        pause-and-retry runs instead of hanging (Phase 2 review finding).
 * Author review: pending — Jian Bing to record what he checked.
 */
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
