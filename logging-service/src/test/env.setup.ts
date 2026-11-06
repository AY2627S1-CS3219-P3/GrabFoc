/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated this Jest setup, following supplier-service/src/test/env.setup.ts.
 * Author review: Cole Lin, read and approved.
 */

/**
 * Runs before every test file. src/config.ts reads the repo-root .env when it exists but never
 * overrides a variable already set, so pinning every LOGGING_ variable here keeps a developer's
 * own .env out of the tests.
 */
import * as path from 'path';

// AI-generated (reviewed by Cole Lin).

// Unit tests never connect to it; the integration tests use LOGGING_TEST_DATABASE_URL instead.
process.env.LOGGING_DATABASE_URL = 'postgres://unused@127.0.0.1:1/unused';
// Nothing listens on port 9, so a test that forgets to point this at its stub JWKS server fails
// with JwksUnavailableError instead of reaching a real User Service.
process.env.LOGGING_JWKS_URL = 'http://127.0.0.1:9/.well-known/jwks.json';
process.env.LOGGING_JWT_ISSUER = '';
process.env.LOGGING_JWT_AUDIENCE = '';
process.env.LOGGING_PORT = '';
// Ingest off unless a test asks for it.
process.env.LOGGING_KAFKA_BROKERS = '';
process.env.LOGGING_RETENTION_DAYS = '';
process.env.LOGGING_PURGE_INTERVAL_MINUTES = '';
void path;
