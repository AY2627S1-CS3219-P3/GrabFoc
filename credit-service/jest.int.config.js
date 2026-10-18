/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Copied the integration-test Jest config from supplier-service/jest.int.config.js.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 */

// The integration tests (*.int.spec.ts): the unit-test config from package.json, run on the other
// set of files. A separate file rather than CLI flags, so `npm run test:int -- <path>` still works.
module.exports = {
  ...require('./package.json').jest,
  testMatch: ['**/*.int.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // One file at a time: every file empties the same credit_test tables.
  maxWorkers: 1,
};
