/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Copied from notification-service/src/test/env.setup.ts.
 * Author review: Reviewed by Deanson, 2026-11-09.
 */

/**
 * Runs before every test file. src/config.ts reads the repo-root .env but never overrides a
 * variable that is already set, so pinning chat's variables here keeps a developer's .env out.
 */
process.env.CHAT_DATABASE_URL = 'postgres://unused@127.0.0.1:1/unused';
process.env.CHAT_PORT = '';
export const TEST_TICKET_SECRET = 'test-chat-ticket-secret-at-least-32-chars';
process.env.CHAT_TICKET_SECRET = TEST_TICKET_SECRET;
