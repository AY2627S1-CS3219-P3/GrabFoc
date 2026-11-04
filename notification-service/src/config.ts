/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated the scaffold's settings (#149), following credit-service/src/config.ts. Kafka, SMTP
 *        and User Service settings are added with the code that reads them (#152, #153).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Added the Kafka settings (#152), following credit-service/src/config.ts.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added the SMTP, User Service and frontend link settings (#153).
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
  // Kafka bootstrap servers, comma-separated: kafka:9092 inside Compose, 127.0.0.1:9094 from the host.
  kafkaBrokers: required('NOTIFICATION_KAFKA_BROKERS')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean),
  // The Kafka tests set their own, so they never take the running service's messages.
  kafkaGroupId: 'notification-service',
  // Mailpit in development (inbox on :8025). User and password are optional: Mailpit needs neither.
  smtp: {
    host: required('NOTIFICATION_SMTP_HOST'),
    port: Number(required('NOTIFICATION_SMTP_PORT')),
    user: process.env.NOTIFICATION_SMTP_USER || undefined,
    pass: process.env.NOTIFICATION_SMTP_PASS || undefined,
    from: required('NOTIFICATION_SMTP_FROM'),
  },
  // Where each recipient's email comes from: GET /internal/users/:userId/contact (#151).
  userUrl: required('NOTIFICATION_USER_URL').replace(/\/+$/, ''),
  // Must equal the User Service's USER_INTERNAL_SERVICE_KEY.
  userServiceKey: required('NOTIFICATION_USER_SERVICE_KEY'),
  // The button in every email opens this page.
  frontendUrl: required('NOTIFICATION_FRONTEND_URL'),
};
