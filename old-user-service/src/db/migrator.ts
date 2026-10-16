/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the migration runner (version table, advisory lock, per-file transaction).
 * Author review: Read in full; verified the service starts, migrates and serves /health under docker compose.
 */
import { Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { Pool } from 'pg';

/**
 * Applies every `migrations/*.sql` file that this database has not run yet, in filename order,
 * recording each in `schema_migrations`.
 *
 * Why migrations rather than the Supplier Service's startup `CREATE TABLE IF NOT EXISTS`:
 * `CREATE TYPE` has no `IF NOT EXISTS` form (this service needs two enums), and `IF NOT EXISTS`
 * silently skips a table that already exists in an *older* shape — so a column added later
 * never appears on a teammate's database and the failure surfaces as a confusing query error.
 * See AGENTS.md, "Implementation".
 */

/** Any constant; it just has to be the same in every process that migrates this database. */
const ADVISORY_LOCK_ID = 4815162342;

export function migrationsDir(): string {
  // dist/db/migrator.js -> user-service/migrations (and src/db -> the same place in dev).
  return path.resolve(__dirname, '../../migrations');
}

export async function runMigrations(
  pool: Pool,
  dir: string = migrationsDir(),
  logger: Logger = new Logger('Migrations'),
): Promise<void> {
  const client = await pool.connect();
  try {
    // Two containers starting at once would otherwise both try to apply 001. The second
    // waits here until the first has committed.
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     TEXT        PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));

    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      logger.log(`Schema up to date (${applied.size} applied)`);
      return;
    }

    for (const file of pending) {
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      // One transaction per file, so a failure leaves the database on the previous version
      // rather than half-migrated.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.log(`Applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
