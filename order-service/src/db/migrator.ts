/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Implemented the user-approved Order database-only plan.
Author review: Design and plan approved by user; implementation review pending.
*/
// AI-generated; human review pending.
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

// Same mechanism as User Service, with an Order-local session lock.
const MIGRATION_LOCK = 3219003;
export const migrationsDirectory = resolve(__dirname, '../../migrations');

export async function runMigrations(pool: Pool, directory = migrationsDirectory): Promise<string[]> {
  const files = (await readdir(directory)).filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort();
  const client = await pool.connect();
  let locked = false;
  let discardClient = false;
  const appliedNow: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const { rows } = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map(row => row.version));
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(resolve(directory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedNow.push(file);
      } catch (cause) {
        try { await client.query('ROLLBACK'); } catch { discardClient = true; }
        throw new Error(`Migration ${file} failed`, { cause });
      }
    }
    return appliedNow;
  } finally {
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]); }
      catch { discardClient = true; }
    }
    client.release(discardClient);
  }
}
