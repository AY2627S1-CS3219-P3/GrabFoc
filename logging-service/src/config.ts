/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated configuration loading, following supplier-service/src/config.ts. The variable
 *        names and defaults follow the plan Cole Lin approved in chat on 2026-10-16.
 * Author review: Cole Lin, read and approved.
 */
import { existsSync } from 'fs';
import * as path from 'path';

// AI-generated (reviewed by Cole Lin).

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

function positive(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive whole number, got "${raw}"`);
  }
  return value;
}

export const config = {
  port: positive('LOGGING_PORT', 3005),
  databaseUrl: required('LOGGING_DATABASE_URL'),

  // There is no dev-auth header fallback here, unlike the Supplier Service. This store pools one
  // row per request across every service, so a USER's id, the paths they called and when sit in
  // one queryable place; an unauthenticated header that can claim ADMIN has no business near it.
  // Every caller needs a real token from the User Service.
  jwksUrl: required('LOGGING_JWKS_URL'),
  jwtIssuer: process.env.LOGGING_JWT_ISSUER || undefined,
  jwtAudience: process.env.LOGGING_JWT_AUDIENCE || undefined,

  // Unset brokers means the consumer never starts: the query API still works, and the service can
  // run before the shared broker (#75) exists. The same rule holds in the producer every service
  // copies, so no service needs a broker just to log.
  kafkaBrokers: (process.env.LOGGING_KAFKA_BROKERS || '')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean),
  // Named like Credit's topics (credit.commands, credit.user-events). It must also be listed in
  // infra/kafka/topics.txt, which #75 owns: services never create topics.
  kafkaTopic: process.env.LOGGING_KAFKA_TOPIC || 'logging.lines',
  kafkaGroupId: process.env.LOGGING_KAFKA_GROUP_ID || 'logging-service',

  // 30 days, deliberately shorter than the 90 the root AGENTS.md gives location_changes: these
  // rows carry a user id, a path and a timestamp together.
  retentionDays: positive('LOGGING_RETENTION_DAYS', 30),
  purgeIntervalMinutes: positive('LOGGING_PURGE_INTERVAL_MINUTES', 60),
};
