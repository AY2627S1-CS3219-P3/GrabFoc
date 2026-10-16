/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated this Jest setup, following supplier-service/src/test/env.setup.ts.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Pinned the Kafka variables.
 * Author review: pending — Jian Bing to record what he checked.
 */

/**
 * Runs before every test file. src/config.ts reads the repo-root .env when it exists, but never
 * overrides a variable that is already set. Pinning every Credit variable here keeps a
 * developer's own .env out of the tests.
 */

// Unit tests never connect to it; the integration tests use CREDIT_TEST_DATABASE_URL instead.
process.env.CREDIT_DATABASE_URL = 'postgres://unused@127.0.0.1:1/unused';
process.env.CREDIT_SERVICE_KEY = 'test-service-key-0123456789abcdef0123456789abcdef';
process.env.CREDIT_PORT = '';
// Nothing listens on port 9, so a test that forgets to point this at its stub fails with
// JwksUnavailableError instead of reaching a real User Service.
process.env.CREDIT_JWKS_URL = 'http://127.0.0.1:9/.well-known/jwks.json';
process.env.CREDIT_JWT_ISSUER = '';
process.env.CREDIT_JWT_AUDIENCE = '';
// Nothing listens on port 1; the Kafka tests use CREDIT_TEST_KAFKA_BROKERS instead.
process.env.CREDIT_KAFKA_BROKERS = '127.0.0.1:1';
process.env.CREDIT_RETRY_DELAYS = '';
