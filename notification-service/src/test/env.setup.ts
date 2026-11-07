/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated this Jest setup, following credit-service/src/test/env.setup.ts (#149).
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
