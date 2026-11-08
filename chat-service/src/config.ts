/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Generated from notification-service/src/config.ts and the chat plan
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { existsSync } from 'fs';
import * as path from 'path';

// Load the repo-root .env if it exists (it is git-ignored). Real env vars take precedence.
const ENV_PATH = path.resolve(__dirname, '../../.env');
if (existsSync(ENV_PATH) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(ENV_PATH);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

/** As for Order's service key: long enough that guessing it is hopeless. */
const MIN_SECRET_LENGTH = 32;

function ticketSecret(): Uint8Array {
  const secret = required('CHAT_TICKET_SECRET').trim();
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`CHAT_TICKET_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return new TextEncoder().encode(secret);
}

export const config = {
  port: Number(process.env.CHAT_PORT || 3007),
  // The password goes in PGPASSWORD, which pg reads directly, so special characters can't break the URL.
  databaseUrl: required('CHAT_DATABASE_URL'),
  // Shared with Order, which signs the tickets. Never the JWT signing key.
  ticketSecret: ticketSecret(),
};
