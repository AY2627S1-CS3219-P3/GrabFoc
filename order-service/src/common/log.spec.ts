/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
 * Scope: This service runs its tests with `node --test`, which leaves NODE_ENV unset - so the log
 *        shipper's first test-runner guard did not fire here, and a repository-root .env with
 *        ORDER_KAFKA_BROKERS set would have built a real producer during the HTTP tests
 *        (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

// AI-generated (reviewed by Cole Lin).

test('the log shipper builds no producer under node --test', async () => {
  // What this runner does and does not set: the guard has to read the second one.
  assert.equal(process.env.NODE_ENV, undefined);
  assert.ok(process.env.NODE_TEST_CONTEXT, 'node --test should set NODE_TEST_CONTEXT');

  // Brokers configured, as the repository-root .env has them, which common/log.ts loads itself.
  process.env.ORDER_KAFKA_BROKERS = 'kafka:9092';
  const { log } = await import('./log');

  // Observable without reaching into the module: with a publisher the shipper buffers a line for
  // the broker; with none it only writes to stdout, so nothing is retained.
  const written: string[] = [];
  const original = console.log;
  console.log = (line: string) => void written.push(line);
  try {
    log.emit({ level: 'info', event: 'probe' });
  } finally {
    console.log = original;
  }
  assert.equal(written.length, 1);
  assert.equal(log.counts.emitted, 1);
  assert.equal(log.counts.dropped, 0);
  // The line reached stdout and nothing is waiting to be shipped.
  await log.flush();
  assert.equal(log.counts.failed, 0);
});
