/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Copied from notification-service/jest.int.config.js.
 * Author review: Reviewed by Deanson, 2026-11-09.
 */

// The integration tests (*.int.spec.ts) need PostgreSQL: set CHAT_TEST_DATABASE_URL, or run
// `docker compose -f compose.test.yaml up --build --abort-on-container-exit` (see README.md).
module.exports = {
  ...require('./package.json').jest,
  testMatch: ['**/*.int.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // One file at a time: every file empties the same messages table.
  maxWorkers: 1,
};
