/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-29
 * Scope: Generated these startup tests after the SoCLaaS review asked for one asserting that
 *        SUPPLIER_DEV_AUTH=true is refused when NODE_ENV=production.
 * Author review (Cole Lin): Read in full; ran `npm test` and checked both cases fail when the
 * guard in src/config.ts is removed.
 */
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const configPath = fileURLToPath(new URL('../dist/config.js', import.meta.url));

/** Load the built config in a child process; returns { ok, output }. */
function loadConfig(env) {
  try {
    const output = execFileSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})`], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output };
  } catch (err) {
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const base = {
  SUPPLIER_DATABASE_URL: 'postgres://user:pass@localhost:5432/supplier',
  SUPPLIER_JWKS_URL: 'http://localhost:3001/.well-known/jwks.json',
  NODE_ENV: '',
  SUPPLIER_DEV_AUTH: '',
};

test('dev-auth headers are refused when NODE_ENV=production', () => {
  const { ok, output } = loadConfig({ ...base, NODE_ENV: 'production', SUPPLIER_DEV_AUTH: 'true' });
  assert.equal(ok, false, 'startup should fail');
  assert.match(output, /refused when NODE_ENV=production/);
});

test('dev-auth is allowed outside production', () => {
  const { ok, output } = loadConfig({ ...base, SUPPLIER_DEV_AUTH: 'true' });
  assert.equal(ok, true, `startup should succeed, got: ${output}`);
});

test('production starts normally without dev auth', () => {
  const { ok, output } = loadConfig({ ...base, NODE_ENV: 'production' });
  assert.equal(ok, true, `startup should succeed, got: ${output}`);
});
