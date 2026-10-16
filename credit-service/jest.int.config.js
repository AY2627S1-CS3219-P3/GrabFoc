/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Copied the integration-test Jest config from supplier-service/jest.int.config.js.
 * Author review: pending — Jian Bing to record what he checked.
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
