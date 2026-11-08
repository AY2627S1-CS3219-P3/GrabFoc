/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the PostgreSQL tests for the login summary and per-user login events (#180).
 * Author review: Reviewed by Zi Yi, 2026-11-05.
 */
// AI-generated (reviewed by Zi Yi)
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../infra/database/database.service';
import { migrationsDir } from '../infra/database/migrator';
import { LoginEventsRepository, LoginOutcome } from './login-events.repository';

// Runs against a real PostgreSQL, like outbox.repository.int.spec.ts:
//   USER_TEST_DATABASE_URL=postgres://foc:<password>@localhost:5432/users npx vitest run
// Everything happens in a throwaway schema, which is dropped afterwards.
const url = process.env.USER_TEST_DATABASE_URL;

describe.skipIf(!url)('LoginEventsRepository (PostgreSQL)', () => {
  const schema = `login_events_test_${randomUUID().replace(/-/g, '')}`;
  let pool: Pool;
  let repo: LoginEventsRepository;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
    });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(
      await fs.readFile(path.join(migrationsDir(), '001_init.sql'), 'utf8'),
    );
    repo = new LoginEventsRepository(new DatabaseService(pool));
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM login_events');
  });

  async function addUser(displayName: string): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO users (id, display_name, email_hash, email_encrypted) VALUES ($1, $2, $3, '\\x00')`,
      [id, displayName, randomUUID().replace(/-/g, '').padEnd(64, '0')],
    );
    return id;
  }

  /** `count` rows of `outcome`, `minutesAgo` before now, one second apart. */
  async function addEvents(
    userId: string,
    outcome: LoginOutcome,
    count: number,
    minutesAgo = 1,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO login_events (user_id, outcome, occurred_at)
       SELECT $1, $2, now() - make_interval(mins => $3) - make_interval(secs => i)
       FROM generate_series(1, $4) AS i`,
      [userId, outcome, minutesAgo, count],
    );
  }

  it('flags more than 10 failures in 24 hours, not 10, most first', async () => {
    const eleven = await addUser('Eleven');
    const ten = await addUser('Ten');
    const twelve = await addUser('Twelve');
    await addEvents(eleven, LoginOutcome.WRONG_PASSWORD, 10, 120);
    await addEvents(eleven, LoginOutcome.LOCKED, 1, 120);
    await addEvents(ten, LoginOutcome.WRONG_PASSWORD, 10, 120);
    await addEvents(twelve, LoginOutcome.WRONG_PASSWORD, 12, 120);

    const { flagged, failedLast24h } = await repo.summary();

    expect(flagged.map((f) => [f.displayName, f.failedCount])).toEqual([
      ['Twelve', 12],
      ['Eleven', 11],
    ]);
    expect(flagged[0]).toMatchObject({ userId: twelve, status: 'ACTIVE' });
    expect(failedLast24h).toBe(33);
  });

  it('ignores rows older than 24 hours, and SUSPENDED, DEACTIVATED and SUCCESS outcomes', async () => {
    const bob = await addUser('Bob');
    await addEvents(bob, LoginOutcome.WRONG_PASSWORD, 5, 24 * 60 + 5);
    await addEvents(bob, LoginOutcome.WRONG_PASSWORD, 6, 120);
    await addEvents(bob, LoginOutcome.SUSPENDED, 5, 120);
    await addEvents(bob, LoginOutcome.DEACTIVATED, 5, 120);
    await addEvents(bob, LoginOutcome.SUCCESS, 5, 120);

    const summary = await repo.summary();

    expect(summary.failedLast24h).toBe(6);
    expect(summary.flagged).toEqual([]);
  });

  it('counts as locked now only accounts whose lock started in the last 15 minutes', async () => {
    const recent = await addUser('Recent');
    const old = await addUser('Old');
    await addEvents(recent, LoginOutcome.LOCKED, 2, 5);
    await addEvents(old, LoginOutcome.LOCKED, 1, 20);

    expect((await repo.summary()).lockedNow).toBe(1);
  });

  it('lists only the last hour of failures, newest first', async () => {
    const bob = await addUser('Bob');
    await addEvents(bob, LoginOutcome.WRONG_PASSWORD, 1, 61);
    await addEvents(bob, LoginOutcome.WRONG_PASSWORD, 1, 30);
    await addEvents(bob, LoginOutcome.LOCKED, 1, 10);
    await addEvents(bob, LoginOutcome.SUSPENDED, 1, 5);

    const { recentFailures } = await repo.summary();

    expect(recentFailures.map((r) => r.outcome)).toEqual([
      'LOCKED',
      'WRONG_PASSWORD',
    ]);
    expect(recentFailures[0]).toMatchObject({
      userId: bob,
      displayName: 'Bob',
    });
  });

  it('caps the recent failures at 50', async () => {
    await addEvents(await addUser('Bob'), LoginOutcome.WRONG_PASSWORD, 60, 1);
    expect((await repo.summary()).recentFailures).toHaveLength(50);
  });

  it("pages one user's events newest first, every outcome included", async () => {
    const bob = await addUser('Bob');
    const other = await addUser('Other');
    await addEvents(bob, LoginOutcome.WRONG_PASSWORD, 2, 30);
    await addEvents(bob, LoginOutcome.SUCCESS, 1, 10);
    await addEvents(other, LoginOutcome.SUCCESS, 4, 10);

    const first = await repo.listForUser(bob, 1, 2);
    const second = await repo.listForUser(bob, 2, 2);

    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(first.items.map((e) => e.outcome)).toEqual([
      'SUCCESS',
      'WRONG_PASSWORD',
    ]);
    expect(second.items).toHaveLength(1);
  });

  it('record() writes one row with the outcome', async () => {
    const bob = await addUser('Bob');
    await repo.record(bob, LoginOutcome.LOCKED);
    const { rows } = await pool.query(
      'SELECT outcome FROM login_events WHERE user_id = $1',
      [bob],
    );
    expect(rows).toEqual([{ outcome: 'LOCKED' }]);
  });
});
