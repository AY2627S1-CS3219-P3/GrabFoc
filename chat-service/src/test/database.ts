/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Adapted from notification-service/src/test/database.ts; applies migrations instead of startup SQL.
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { Pool } from 'pg';
import { runMigrations } from '../db/migrator';

/** CHAT_TEST_DATABASE_URL. Its database name must end in _test, because every test file empties it. */
export function testDatabaseUrl(): string {
  const raw = process.env.CHAT_TEST_DATABASE_URL;
  if (!raw) {
    throw new Error(
      'CHAT_TEST_DATABASE_URL is required for integration tests, or run them with ' +
        '`docker compose -f compose.test.yaml up --build --abort-on-container-exit`.',
    );
  }
  const url = new URL(raw);
  if (!url.pathname.slice(1).endsWith('_test')) {
    throw new Error(`Refusing to run integration tests against "${url.pathname.slice(1)}": its name must end in _test.`);
  }
  return url.toString();
}

/** Applies the migrations and returns a pool. */
export async function openTestDatabase(): Promise<Pool> {
  const pool = new Pool({ connectionString: testDatabaseUrl(), max: 10 });
  await runMigrations(pool);
  return pool;
}

export async function emptyTables(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE messages RESTART IDENTITY');
}
