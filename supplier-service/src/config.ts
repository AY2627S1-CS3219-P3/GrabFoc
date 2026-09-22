/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated configuration loading (environment variables, .env file).
 * Author review: pending — to be completed by the reviewing team member.
 */
import * as path from 'path';

// Load the repo-root .env if it exists (it is git-ignored). Real env vars take precedence.
try {
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
} catch {
  // no .env file: rely on the environment
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name} (see .env.example)`);
  }
  return value;
}

export const config = {
  port: Number(process.env.SUPPLIER_PORT || 3002),
  databaseUrl: required('SUPPLIER_DATABASE_URL'),
  seedCsvPath:
    process.env.SUPPLIER_SEED_CSV || path.resolve(__dirname, '../../data/csv/supplier-seed-data.csv'),
};
