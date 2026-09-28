/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated configuration loading (environment variables, .env file).
 * Author review: pending — to be completed by the reviewing team member.
 */
import { existsSync } from 'fs';
import * as path from 'path';

// Load the repo-root .env if it exists (it is git-ignored). Real env vars take precedence.
// process.loadEnvFile needs Node 22.12+, so say so plainly instead of failing later with a
// confusing "missing environment variable".
const ENV_PATH = path.resolve(__dirname, '../../.env');
if (existsSync(ENV_PATH)) {
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error(
      `Node ${process.version} cannot read ${ENV_PATH}: reading .env files needs Node 22.12 or newer. ` +
        'Upgrade Node, or set the variables in your environment instead (see .env.example).',
    );
  }
  process.loadEnvFile(ENV_PATH);
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
  // The User Service publishes the public half of its signing key here; this service verifies
  // every forwarded token against it.
  jwksUrl: required('SUPPLIER_JWKS_URL'),
  // Checked only when set, matching the gateway.
  jwtIssuer: process.env.SUPPLIER_JWT_ISSUER || undefined,
  jwtAudience: process.env.SUPPLIER_JWT_AUDIENCE || undefined,
  // LOCAL TESTING ONLY: accept X-User-Id / X-User-Role when no bearer token is sent, so the
  // service can be exercised in Postman without the User Service running. Never enable this
  // anywhere reachable by anyone else: the headers are unauthenticated, so any caller could
  // claim to be an ADMIN.
  devAuth: process.env.SUPPLIER_DEV_AUTH === 'true',
};

if (config.devAuth && process.env.NODE_ENV === 'production') {
  throw new Error(
    'SUPPLIER_DEV_AUTH=true is refused when NODE_ENV=production: the header fallback is for local testing only.',
  );
}
