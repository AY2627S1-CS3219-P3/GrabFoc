/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated configuration loading, following supplier-service/src/config.ts.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { existsSync } from 'fs';
import * as path from 'path';

// Load the repo-root .env if it exists (it is git-ignored). Real env vars take precedence.
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

/** Shortest accepted service key, so a placeholder like "secret" can't be deployed by mistake. */
export const MIN_SERVICE_KEY_LENGTH = 32;

const serviceKey = required('CREDIT_SERVICE_KEY');
if (serviceKey.length < MIN_SERVICE_KEY_LENGTH) {
  throw new Error(
    `CREDIT_SERVICE_KEY must be at least ${MIN_SERVICE_KEY_LENGTH} characters ` +
      '(generate one with `openssl rand -hex 32`).',
  );
}

export const config = {
  port: Number(process.env.CREDIT_PORT || 3004),
  databaseUrl: required('CREDIT_DATABASE_URL'),
  // Shared with the Order Service, the only caller of the /internal/credits routes.
  serviceKey,
};
