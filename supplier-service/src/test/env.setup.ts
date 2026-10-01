/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated this Jest setup, following user-service/src/test/env.setup.ts.
 * Author review: pending — Jian Bing to record what he checked.
 */

/**
 * Runs before every test file. src/config.ts reads the repo-root .env when it exists, but never
 * overrides a variable that is already set, even to ''. Pinning every Supplier variable here keeps
 * a developer's own .env (e.g. NODE_ENV=production or SUPPLIER_DEV_AUTH=true) out of the tests.
 */
import * as path from 'path';

// Unit tests never connect to it; the integration tests use SUPPLIER_TEST_DATABASE_URL instead.
process.env.SUPPLIER_DATABASE_URL = 'postgres://unused@127.0.0.1:1/unused';
// Nothing listens on port 9, so a test that forgets to point this at its stub JWKS server fails
// with JwksUnavailableError instead of reaching a real User Service.
process.env.SUPPLIER_JWKS_URL = 'http://127.0.0.1:9/.well-known/jwks.json';
process.env.SUPPLIER_JWT_ISSUER = '';
process.env.SUPPLIER_JWT_AUDIENCE = '';
process.env.SUPPLIER_DEV_AUTH = '';
process.env.SUPPLIER_PORT = '';
process.env.SUPPLIER_SEED_CSV = path.resolve(__dirname, '../../../data/csv/supplier-seed-data.csv');
