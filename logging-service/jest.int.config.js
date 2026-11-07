/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Copied from supplier-service/jest.int.config.js.
 * Author review: Cole Lin, read and approved.
 */

// The integration tests (*.int.spec.ts): the unit-test config from package.json, run on the other
// set of files. A separate file rather than CLI flags, so `npm run test:int -- <path>` still works.
module.exports = {
  ...require('./package.json').jest,
  testMatch: ['**/*.int.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // One file at a time: every file empties the same logging_test table, so running them in
  // parallel lets one file's rows leak into another's assertions.
  maxWorkers: 1,
};
