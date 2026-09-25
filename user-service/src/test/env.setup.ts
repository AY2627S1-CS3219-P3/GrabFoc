/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the Jest environment setup.
 * Author review: Read in full; `npm test` passes (46 tests).
 */

/**
 * `config.ts` validates the environment when it is first imported, so anything that reaches
 * it through the crypto helpers needs these set before the test runs.
 *
 * The keys are FIXED so HMAC outputs are deterministic and the tests can assert exact
 * values. They are test fixtures, not secrets, and are not used anywhere else.
 */
process.env.USER_DATABASE_URL ||= 'postgres://test@127.0.0.1:5432/test';
process.env.USER_AES_KEY ||= 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
process.env.USER_EMAIL_HMAC_KEY ||= 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=';
process.env.USER_OTP_HMAC_KEY ||= 'QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl8=';
