/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated this Jest setup, following credit-service/src/test/env.setup.ts (#149).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Pinned NOTIFICATION_KAFKA_BROKERS (#152).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Pinned the SMTP, User Service and frontend settings (#153).
 * Author review: pending — Jie Yang to record the review.
 */

/**
 * Runs before every test file. src/config.ts reads the repo-root .env when it exists, but never
 * overrides a variable that is already set. Pinning every Notification variable here keeps a
 * developer's own .env out of the tests.
 */

// Unit tests never connect to it.
process.env.NOTIFICATION_DATABASE_URL = 'postgres://unused@127.0.0.1:1/unused';
process.env.NOTIFICATION_PORT = '';
// Nothing connects at import time; the Kafka tests point config.kafkaBrokers at the test broker.
process.env.NOTIFICATION_KAFKA_BROKERS = '127.0.0.1:1';
// Nothing is sent from the unit tests; the integration tests pass a fake mailer and User client.
process.env.NOTIFICATION_SMTP_HOST = '127.0.0.1';
process.env.NOTIFICATION_SMTP_PORT = '1';
process.env.NOTIFICATION_SMTP_USER = '';
process.env.NOTIFICATION_SMTP_PASS = '';
process.env.NOTIFICATION_SMTP_FROM = 'FoC <no-reply@foc.test>';
process.env.NOTIFICATION_USER_URL = 'http://127.0.0.1:1';
process.env.NOTIFICATION_USER_SERVICE_KEY = 'k'.repeat(64);
process.env.NOTIFICATION_FRONTEND_URL = 'https://foc.test';
