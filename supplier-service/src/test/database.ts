/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated this helper for the integration tests: a separate supplier_test database in
 *        the supplier-db container, created and emptied by the tests themselves.
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
function setting(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const envPath = path.resolve(__dirname, '../../../.env');
  return existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8'))[name] || undefined : undefined;
}

/**
 * The integration tests use their own database, never the one the running service uses, because
 * they empty the locations table before every test. By default it is `supplier_test` in the
 * compose supplier-db container (`docker compose up supplier-db`), on the host port 5434.
 */
export function testDatabaseUrl(): string {
  const password = encodeURIComponent(setting('SUPPLIER_POSTGRES_PASSWORD') || 'change-me-in-dotenv');
  const url = new URL(
    setting('SUPPLIER_TEST_DATABASE_URL') || `postgres://foc:${password}@localhost:5434/supplier_test`,
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
        'Start it with `docker compose up supplier-db`, or set SUPPLIER_TEST_DATABASE_URL.',
    );
  } finally {
    await admin.end();
  }
  const pool = new Pool({ connectionString: url.toString() });
  await pool.query(SCHEMA_SQL);
  return pool;
}

/** Empties the locations table and restarts its ids at 1. */
export async function emptyLocations(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE locations RESTART IDENTITY');
}
