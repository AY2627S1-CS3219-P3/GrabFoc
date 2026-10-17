/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated this integration-test helper, following supplier-service/src/test/database.ts:
 *        a separate credit_test database in the credit-db container.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Exported setting() for the Kafka test helpers; emptyTables also empties credit_dead_letters.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: emptyTables also empties credit_transactions.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { parseEnv } from 'util';
import { SCHEMA_SQL } from '../db/schema';

/**
 * A setting from the environment, else from the repo-root .env. Read here rather than relying on
 * src/config.ts: its process.loadEnvFile writes to the real process environment, which Jest's
 * per-file copy of process.env does not see.
 */
export function setting(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const envPath = path.resolve(__dirname, '../../../.env');
  return existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8'))[name] || undefined : undefined;
}

/**
 * The integration tests use their own database, never the one the running service uses, because
 * they empty every table before each test. By default it is `credit_test` in the compose
 * credit-db container (`docker compose up credit-db`), on the host port 5435.
 */
export function testDatabaseUrl(): string {
  const password = encodeURIComponent(setting('CREDIT_POSTGRES_PASSWORD') || 'change-me-in-dotenv');
  const url = new URL(setting('CREDIT_TEST_DATABASE_URL') || `postgres://foc:${password}@localhost:5435/credit_test`);
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
        'Start it with `docker compose up credit-db`, or set CREDIT_TEST_DATABASE_URL.',
    );
  } finally {
    await admin.end();
  }
  // Enough connections for the concurrency tests to really run side by side.
  const pool = new Pool({ connectionString: url.toString(), max: 20 });
  await pool.query(SCHEMA_SQL);
  return pool;
}

/** Empties every table. */
export async function emptyTables(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE credit_transactions, credit_holds, credit_accounts, credit_dead_letters');
}
