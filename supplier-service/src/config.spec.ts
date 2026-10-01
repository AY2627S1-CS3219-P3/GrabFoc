/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-29
 * Scope: Generated these startup tests after the SoCLaaS review asked for one asserting that
 *        SUPPLIER_DEV_AUTH=true is refused when NODE_ENV=production.
 * Author review (Cole Lin): Read in full; ran `npm test` and checked both cases fail when the
 * guard in src/config.ts is removed.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Moved these tests from test/config.test.mjs (Node's runner, against dist/) to Jest,
 *        with the same checks, and added the missing-variable cases.
 * Author review (Jian Bing): Ran `npm test` on 2026-10-01 (157 passed) and verified each test
 *        case in this file by hand.
 */

/** Evaluates src/config.ts afresh with the given environment; returns the error message, or 'ok'. */
function loadConfig(env: Record<string, string>): string {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    jest.isolateModules(() => {
      require('./config');
    });
    return 'ok';
  } catch (err) {
    return (err as Error).message;
  } finally {
    process.env = saved;
  }
}

// '' rather than unset, so a developer's own .env cannot fill these in (see test/env.setup.ts).
const base = {
  SUPPLIER_DATABASE_URL: 'postgres://user:pass@localhost:5432/supplier',
  SUPPLIER_JWKS_URL: 'http://localhost:3001/.well-known/jwks.json',
  NODE_ENV: '',
  SUPPLIER_DEV_AUTH: '',
};

it('refuses dev-auth headers when NODE_ENV=production', () => {
  expect(loadConfig({ ...base, NODE_ENV: 'production', SUPPLIER_DEV_AUTH: 'true' })).toMatch(
    /refused when NODE_ENV=production/,
  );
});

it('allows dev auth outside production', () => {
  expect(loadConfig({ ...base, SUPPLIER_DEV_AUTH: 'true' })).toBe('ok');
});

it('starts normally in production without dev auth', () => {
  expect(loadConfig({ ...base, NODE_ENV: 'production' })).toBe('ok');
});

it('refuses to start without a database URL', () => {
  expect(loadConfig({ ...base, SUPPLIER_DATABASE_URL: '' })).toMatch(/Missing environment variable SUPPLIER_DATABASE_URL/);
});

it('refuses to start without a JWKS URL unless dev auth is on', () => {
  expect(loadConfig({ ...base, SUPPLIER_JWKS_URL: '' })).toMatch(/Missing environment variable SUPPLIER_JWKS_URL/);
  expect(loadConfig({ ...base, SUPPLIER_JWKS_URL: '', SUPPLIER_DEV_AUTH: 'true' })).toBe('ok');
});
