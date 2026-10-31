/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Copied from credit-service/jest.int.config.js (#150).
 * Author review: pending — Jie Yang to record the review.
 */

// The integration tests (*.int.spec.ts) need `docker compose up -d notification-db`.
module.exports = {
  ...require('./package.json').jest,
  testMatch: ['**/*.int.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // One file at a time: every file empties the same notification_test tables.
  maxWorkers: 1,
};
