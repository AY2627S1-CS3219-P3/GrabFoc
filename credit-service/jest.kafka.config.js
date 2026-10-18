/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Jest config for the tests that need a real Kafka broker, following jest.int.config.js.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
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
