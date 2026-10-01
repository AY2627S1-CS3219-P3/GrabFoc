/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated this Jest config for the integration tests.
 * Author review: pending — Jian Bing to record what he checked.
 */

// The integration tests (*.int.spec.ts): the unit-test config from package.json, run on the other
// set of files. A separate file rather than CLI flags, so `npm run test:int -- <path>` still works.
module.exports = {
  ...require('./package.json').jest,
  testMatch: ['**/*.int.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // One file at a time: every file empties the same supplier_test tables, so running them in
  // parallel lets one file's rows leak into another's assertions.
  maxWorkers: 1,
};
