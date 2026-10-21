/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the PostgreSQL test for the outbox claim (SKIP LOCKED) and mark published.
 * Author review: pending — Deanson to record what he checked.
 */
// AI-generated (reviewed by Deanson)
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseService } from '../database/database.service';
import { migrationsDir } from '../database/migrator';
import { OutboxRepository } from './outbox.repository';

// Runs against a real PostgreSQL (root AGENTS.md §3), e.g. the compose user-db:
//   USER_TEST_DATABASE_URL=postgres://foc:<password>@localhost:5432/users npx vitest run
// Everything happens in a throwaway schema, which is dropped afterwards.
const url = process.env.USER_TEST_DATABASE_URL;

describe.skipIf(!url)('OutboxRepository (PostgreSQL)', () => {
  const schema = `outbox_test_${randomUUID().replace(/-/g, '')}`;
  let pool: Pool;
  let db: DatabaseService;
  let repo: OutboxRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(await fs.readFile(path.join(migrationsDir(), '002_outbox.sql'), 'utf8'));
    db = new DatabaseService(pool);
    repo = new OutboxRepository(db);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  });

  const add = (id = randomUUID()) =>
    db.transaction((tx) =>
      repo.add({ id, aggregateId: randomUUID(), eventType: 'UserRegistered', topic: 'user.events', payload: { id } }, tx),
    );

  it('never hands the same event to two claims running at once', async () => {
    await add();
    await add();

    let releaseFirst!: () => void;
    const firstHolds = new Promise<void>((resolve) => (releaseFirst = resolve));
    let firstClaimed!: () => void;
    const firstHasClaimed = new Promise<void>((resolve) => (firstClaimed = resolve));

    const first = db.transaction(async (tx) => {
      const rows = await repo.claimPending(tx, 1);
      firstClaimed();
      await firstHolds; // keep the lock while the second claim runs
      return rows;
    });
    await firstHasClaimed;
    const second = await db.transaction((tx) => repo.claimPending(tx, 10));
    releaseFirst();
    const firstRows = await first;

    expect(firstRows).toHaveLength(1);
    expect(second.map((e) => e.id)).not.toContain(firstRows[0].id);
    expect(second).toHaveLength(1);
  });

  it('returns pending events oldest first and stops returning them once published', async () => {
    await pool.query('DELETE FROM outbox');
    const older = randomUUID();
    const newer = randomUUID();
    await add(older);
    await add(newer);

    const claimed = await db.transaction(async (tx) => {
      const rows = await repo.claimPending(tx, 10);
      await repo.markPublished([rows[0].id], tx);
      return rows;
    });

    expect(claimed.map((e) => e.id)).toEqual([older, newer]);
    expect(claimed[0].payload).toEqual({ id: older });
    const left = await db.transaction((tx) => repo.claimPending(tx, 10));
    expect(left.map((e) => e.id)).toEqual([newer]);
  });

  it('a rolled-back transaction leaves no event behind', async () => {
    await pool.query('DELETE FROM outbox');
    const id = randomUUID();

    await expect(
      db.transaction(async (tx) => {
        await repo.add({ id, aggregateId: randomUUID(), eventType: 'UserRegistered', topic: 'user.events', payload: {} }, tx);
        throw new Error('email taken');
      }),
    ).rejects.toThrow('email taken');

    const { rowCount } = await pool.query('SELECT 1 FROM outbox WHERE id = $1', [id]);
    expect(rowCount).toBe(0);
  });
});
