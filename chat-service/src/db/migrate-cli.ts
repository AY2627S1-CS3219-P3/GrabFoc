/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Copied from order-service/src/db/migrate-cli.ts; reads CHAT_DATABASE_URL (+ PGPASSWORD).
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { Pool } from 'pg';
import { runMigrations } from './migrator';

async function main(): Promise<void> {
  const connectionString = process.env.CHAT_DATABASE_URL;
  if (!connectionString) throw new Error('Missing CHAT_DATABASE_URL');
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10_000, max: 1 });
  try {
    const applied = await runMigrations(pool);
    console.info(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Schema is up to date');
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  // Database errors can include connection details or row values; do not print them.
  console.error('Chat database migration failed. Check database settings and migration files.');
  process.exitCode = 1;
});
