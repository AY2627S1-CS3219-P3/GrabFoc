/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Implemented the user-approved Order database-only plan.
Author review: Design and plan approved by user; implementation review pending.
*/
// AI-generated; human review pending.
import { Pool } from 'pg';
import { databaseConfig } from './config';
import { runMigrations } from './migrator';

async function main(): Promise<void> {
  const pool = new Pool(databaseConfig());
  try {
    const applied = await runMigrations(pool);
    console.info(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Schema is up to date');
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  // Database errors can include connection details or row values; do not print them.
  console.error('Order database migration failed. Check database settings and migration files.');
  process.exitCode = 1;
});
