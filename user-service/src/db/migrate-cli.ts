/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the `npm run migrate` entry point.
 * Author review: Read in full; verified the service starts, migrates and serves /health under docker compose.
 */
import { Pool } from 'pg';
import { config } from '../config';
import { runMigrations } from './migrator';

/** `npm run migrate` — applies pending migrations without starting the HTTP server. */
async function main() {
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
