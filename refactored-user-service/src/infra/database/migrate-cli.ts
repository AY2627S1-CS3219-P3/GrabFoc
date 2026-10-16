/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/db/migrate-cli.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25); validates the environment with config/env.validation.ts.
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import * as path from 'path';
import { Pool } from 'pg';
import { validate } from '../../config/env.validation';
import { runMigrations } from './migrator';

/** `npm run migrate`: applies pending migrations without starting the HTTP server. */
async function main() {
  try {
    // dist/infra/database/ -> the repo-root .env, as ConfigModule loads it for the app.
    process.loadEnvFile(path.resolve(__dirname, '../../../../.env'));
  } catch {
    // no .env file: rely on the environment
  }
  const config = validate(process.env);
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
