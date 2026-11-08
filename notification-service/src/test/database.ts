/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Copied the test-database helpers from credit-service/src/test/database.ts (#150).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Default host localhost → 127.0.0.1, like the Kafka test broker.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: emptyTables also empties notification_account_emails (#183).
 * Author review: pending — Jie Yang to record the review.
 */
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { parseEnv } from 'util';
import { SCHEMA_SQL } from '../db/schema';

/**
 * A setting for the tests: the environment first, then the repo-root .env. env.setup.ts pins the
 * service's own variables, so the test-only ones are read here instead.
 */
export function setting(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const envPath = path.resolve(__dirname, '../../../.env');
  return existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8'))[name] || undefined : undefined;
}

/**
 * NOTIFICATION_TEST_DATABASE_URL, else notification_test on the Compose database's host port. The
 * name must end in _test, because every test file empties the tables.
 */
export function testDatabaseUrl(): string {
  const password = encodeURIComponent(setting('NOTIFICATION_POSTGRES_PASSWORD') || 'change-me-in-dotenv');
  const url = new URL(
    // 127.0.0.1, not localhost: some machines resolve localhost to IPv6 first, and Docker resets that.
    setting('NOTIFICATION_TEST_DATABASE_URL') || `postgres://foc:${password}@127.0.0.1:5436/notification_test`,
  );
  if (!url.pathname.slice(1).endsWith('_test')) {
    throw new Error(`Refusing to run integration tests against "${url.pathname.slice(1)}": its name must end in _test.`);
  }
  return url.toString();
}

/** Creates the test database if it doesn't exist, applies the service's schema, and returns a pool. */
export async function openTestDatabase(): Promise<Pool> {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);
  const admin = new Pool({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } catch (err) {
    throw new Error(
      `Cannot reach the test database server at ${url.host} (${(err as Error).message}). ` +
        'Start it with `docker compose up notification-db`, or set NOTIFICATION_TEST_DATABASE_URL.',
    );
  } finally {
    await admin.end();
  }
  const pool = new Pool({ connectionString: url.toString(), max: 10 });
  await pool.query(SCHEMA_SQL);
  return pool;
}

/** Empties every table. */
export async function emptyTables(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE notifications, notification_order_states, notification_events, notification_dead_letters, notification_account_emails',
  );
}
