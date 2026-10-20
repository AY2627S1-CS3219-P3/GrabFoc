/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated unit tests for bearer-token verification against a stub JWKS.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createRemoteJWKSet, generateKeyPair } from 'jose';
import { AppError } from './errors';
import { startJwksStub, type JwksStub } from '../test/jwks-stub';
import { verifyBearer } from './jwt-auth.guard';

let stub: JwksStub;
before(async () => (stub = await startJwksStub()));
after(() => stub.stop());
beforeEach(() => (stub.status = 200));

// A fresh key set per call, so jose's cache never hides a changed stub status.
const jwks = () => createRemoteJWKSet(new URL(stub.url));
const rejects = (status: number) => (error: unknown) => {
  assert.ok(error instanceof AppError);
  assert.equal(error.getStatus(), status);
  return true;
};

test('accepts a valid token and takes identity from its claims', async () => {
  const sub = '4f1c2b9e-1d1a-4a45-85a4-ec20e3380f92';
  const token = await stub.sign({ sub, role: 'ADMIN' });
  assert.deepEqual(await verifyBearer(`Bearer ${token}`, jwks()), { id: sub, role: 'ADMIN' });
});

test('rejects a missing or non-bearer header with 401', async () => {
  await assert.rejects(verifyBearer(undefined, jwks()), rejects(401));
  await assert.rejects(verifyBearer('Basic abc', jwks()), rejects(401));
});

test('rejects malformed, expired and foreign-key tokens with 401', async () => {
  const { privateKey } = await generateKeyPair('RS256');
  for (const token of [
    'not.a.jwt',
    await stub.sign({}, { expiresIn: '-1m' }),
    await stub.sign({}, { key: privateKey }),
  ]) {
    await assert.rejects(verifyBearer(`Bearer ${token}`, jwks()), rejects(401));
  }
});

test('rejects unknown roles and non-UUID subjects with 401', async () => {
  for (const claims of [{ role: 'SUPERUSER' }, { sub: 'user-1' }]) {
    const token = await stub.sign(claims);
    await assert.rejects(verifyBearer(`Bearer ${token}`, jwks()), rejects(401));
  }
});

test('returns 503 when the JWKS cannot be fetched', async () => {
  const token = await stub.sign();
  stub.status = 500;
  await assert.rejects(verifyBearer(`Bearer ${token}`, jwks()), rejects(503));
  const unreachable = createRemoteJWKSet(new URL('http://127.0.0.1:9/.well-known/jwks.json'));
  await assert.rejects(verifyBearer(`Bearer ${token}`, unreachable), rejects(503));
});
