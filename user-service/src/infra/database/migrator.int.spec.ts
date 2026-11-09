/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: PostgreSQL tests that the migrations bring a database created before #180 up to date
 *        (staging's user-db), and change nothing on one created after it.
 * Author review: Pending review by Deanson / Zi Yi (User Service owners).
 */
// AI-generated (Claude Code), review pending
import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { runMigrations } from './migrator';

// Runs against a real PostgreSQL, like login-events.repository.int.spec.ts:
//   USER_TEST_DATABASE_URL=postgres://foc:<password>@localhost:5432/users npx vitest run
// Each test works in its own throwaway schema, dropped afterwards.
const url = process.env.USER_TEST_DATABASE_URL;
const quiet = new Logger('Migrations');
quiet.log = () => undefined;

describe.skipIf(!url)('migrations (PostgreSQL)', () => {
  const pools: { pool: Pool; schema: string }[] = [];

  async function freshSchema(): Promise<Pool> {
    const schema = `migrations_test_${randomUUID().replace(/-/g, '')}`;
    const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    pools.push({ pool, schema });
    return pool;
  }

  afterEach(async () => {
    for (const { pool, schema } of pools.splice(0)) {
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    }
  });

  async function columns(pool: Pool, table: string): Promise<string[]> {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1`,
      [table],
    );
    return rows.map((r) => r.column_name);
  }

  async function indexes(pool: Pool, table: string): Promise<string[]> {
    const { rows } = await pool.query<{ indexname: string }>(
      'SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = $1',
      [table],
    );
    return rows.map((r) => r.indexname);
  }

  it('brings a database created before #180 up to date (staging)', async () => {
    const pool = await freshSchema();
    await runMigrations(pool, undefined, quiet);
    // What a user-db created before #180 looks like: 001 and 002 applied, without #180's objects.
    await pool.query(`
      DROP TABLE login_events;
      DROP TYPE login_outcome;
      ALTER TABLE users DROP COLUMN suspension_reason, DROP COLUMN suspended_at;
      DELETE FROM schema_migrations WHERE version NOT IN ('001_init.sql', '002_outbox.sql');
    `);

    await runMigrations(pool, undefined, quiet);

    expect(await columns(pool, 'users')).toEqual(expect.arrayContaining(['suspension_reason', 'suspended_at']));
    expect(await columns(pool, 'login_events')).toEqual(
      expect.arrayContaining(['id', 'user_id', 'outcome', 'occurred_at']),
    );
    expect(await indexes(pool, 'login_events')).toEqual(
      expect.arrayContaining(['idx_login_events_time', 'idx_login_events_user_time']),
    );
    const { rows } = await pool.query<{ outcome: string }>(
      'SELECT unnest(enum_range(NULL::login_outcome))::text AS outcome',
    );
    expect(rows.map((r) => r.outcome)).toEqual(['SUCCESS', 'WRONG_PASSWORD', 'LOCKED', 'SUSPENDED', 'DEACTIVATED']);
  });

  it('changes nothing on a database created after #180', async () => {
    const pool = await freshSchema();
    await expect(runMigrations(pool, undefined, quiet)).resolves.toBeUndefined();
    expect(await columns(pool, 'users')).toEqual(expect.arrayContaining(['suspension_reason', 'suspended_at']));
    const { rows } = await pool.query<{ n: string }>('SELECT count(*) AS n FROM login_events');
    expect(rows[0].n).toBe('0');
  });
});
