/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Jest config for the tests that need a real Kafka broker, following jest.int.config.js.
 * Author review: pending — Jian Bing to record what he checked.
 */

// The Kafka tests (*.kafka.spec.ts) need `docker compose up -d kafka credit-db`.
module.exports = {
  ...require('./package.json').jest,
  testMatch: ['**/*.kafka.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // They share the credit_test tables with the integration tests.
  maxWorkers: 1,
  testTimeout: 60000,
};
