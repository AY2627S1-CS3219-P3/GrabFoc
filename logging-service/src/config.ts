/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated configuration loading, following supplier-service/src/config.ts. The variable
 *        names and defaults follow the plan Cole Lin approved in chat on 2026-10-16.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Check the database URL parses, after the PR #129 review noted compose interpolates the
 *        password into it without percent-encoding.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Bound LOGGING_PORT by the socket range, like the other two numeric settings
 *        (PR #129 review).
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

/**
  * compose.yaml interpolates LOGGING_POSTGRES_PASSWORD straight into the connection string and
  * cannot percent-encode it, so an unsafe character there produces a URL that means something else.
  *
  * This catches only the URLs that are outright invalid — `#` truncates the authority, and a wrong
  * scheme is a typo. It deliberately does not try to catch everything: `new URL()` accepts
  * `foc:pa@ss@host` by taking the last `@` and encoding the rest, so a password with an `@` parses
  * and then fails later at the driver. Choosing a URL-safe password is the actual protection; this
  * only turns the worst case into a message that says what to do.
  */
function databaseUrl(): string {
  const value = required('LOGGING_DATABASE_URL');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      'LOGGING_DATABASE_URL is not a valid URL. If the password contains # @ : / ? [ ] or %, ' +
        'percent-encode it or choose a password without them (see .env.example).',
    );
  }
  if (!parsed.protocol.startsWith('postgres')) {
    throw new Error(`LOGGING_DATABASE_URL must be a postgres:// URL, got "${parsed.protocol}"`);
  }
  return value;
}

/**
 * `max` is not decoration: `Number.isInteger(1e20)` is true, and a retention of 1e20 days makes the
 * purge fail on every run while `runOnce` catches the error and the service goes on looking
 * healthy — so nothing is ever deleted and nobody finds out (PR #129 review).
 */
/**
 * A required setting that has to be a URL we can fetch. `localhost:3001/...` with no scheme passes
 * a non-empty check, and then every authentication attempt fails in fetch() and is reported as a
 * 503 - so a deployment typo looks like an outage at the User Service, indefinitely (PR #129
 * review). Fail at startup instead.
 */
function httpUrl(name: string): string {
  const value = required(name);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a full http(s) URL, got "${value}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must be http or https, got "${parsed.protocol}"`);
  }
  return value;
}

function positive(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > max) {
    throw new Error(`${name} must be a whole number between 1 and ${max}, got "${raw}"`);
  }
  return value;
}

export const config = {
  // Bounded like the two settings below. Without a maximum, a port above the socket range passed
  // startup and then failed in `app.listen` with ERR_SOCKET_BAD_PORT - a Node error about a socket
  // rather than this file's own message naming the variable and what it may hold (PR #129 review).
  port: positive('LOGGING_PORT', 3006, 65535),
  databaseUrl: databaseUrl(),

  // There is no dev-auth header fallback here, unlike the Supplier Service. This store pools one
  // row per request across every service, so a USER's id, the paths they called and when sit in
  // one queryable place; an unauthenticated header that can claim ADMIN has no business near it.
  // Every caller needs a real token from the User Service.
  jwksUrl: httpUrl('LOGGING_JWKS_URL'),
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
  // Where a line this service cannot store is parked (Kafka rule 6). Listed in
  // infra/kafka/topics.txt like every other topic.
  kafkaDeadLetterTopic: process.env.LOGGING_KAFKA_DLT_TOPIC || 'logging.lines.dlt',
  kafkaGroupId: process.env.LOGGING_KAFKA_GROUP_ID || 'logging-service',

  // 30 days, deliberately shorter than the 90 the root AGENTS.md gives location_changes: these
  // rows carry a user id, a path and a timestamp together.
  // Ten years, which is far longer than this project will run and well inside what PostgreSQL
  // can express as an interval.
  retentionDays: positive('LOGGING_RETENTION_DAYS', 30, 3650),
  // Capped at the setInterval limit in minutes; PurgeService clamps as well and says so.
  purgeIntervalMinutes: positive('LOGGING_PURGE_INTERVAL_MINUTES', 60, 35791),
};
