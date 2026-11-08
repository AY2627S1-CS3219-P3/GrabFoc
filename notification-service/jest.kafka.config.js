/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Copied from credit-service/jest.kafka.config.js (#152).
 * Author review: pending — Jie Yang to record the review.
 */

// The Kafka tests (*.kafka.spec.ts) need `docker compose up -d kafka notification-db`.
module.exports = {
  ...require('./package.json').jest,
  testMatch: ['**/*.kafka.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // They share the notification_test tables with the integration tests.
  maxWorkers: 1,
  testTimeout: 60000,
};
