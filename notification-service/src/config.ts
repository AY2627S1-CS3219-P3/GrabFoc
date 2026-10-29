/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated the scaffold's settings (#149), following credit-service/src/config.ts. Kafka, SMTP
 *        and User Service settings are added with the code that reads them (#152, #153).
 * Author review: pending — Jie Yang to record the review.
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

export const config = {
  port: Number(process.env.NOTIFICATION_PORT || 3006),
  databaseUrl: required('NOTIFICATION_DATABASE_URL'),
};
