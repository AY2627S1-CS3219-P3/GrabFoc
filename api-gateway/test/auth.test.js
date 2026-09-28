/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Checked JWT signature, expiry and issuer verification; distinguished JWKS failure on 2026-09-28.
Author review: Pending gateway owner review.
*/
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { createTokenVerifier } from '../dist/auth.js';

// AI-generated (pending human review)
test('accepts a valid signed JWT and rejects modified, expired and wrong-issuer tokens', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig' };
  const config = {
    jwksUrl: new URL('http://user.example/jwks'),
    jwtIssuer: 'grabfoc-user',
  };
  const verify = createTokenVerifier(config, async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }));
  function token(claims) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = sign('sha256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
    return `${header}.${payload}.${signature}`;
  }
  const valid = token({ sub: 'user-1', iss: 'grabfoc-user', exp: Math.floor(Date.now() / 1000) + 60 });
  assert.equal(await verify(`Bearer ${valid}`), true);
  assert.equal(await verify(`Bearer ${valid.slice(0, -2)}aa`), false);
  assert.equal(await verify(`Bearer ${token({ iss: 'grabfoc-user', exp: 1 })}`), false);
  assert.equal(await verify(`Bearer ${token({ iss: 'other', exp: Math.floor(Date.now() / 1000) + 60 })}`), false);

  const unavailable = createTokenVerifier(config, async () => { throw new Error('network offline'); });
  await assert.rejects(unavailable(`Bearer ${valid}`), /JWKS unavailable/);
  assert.equal(await unavailable('Bearer invalid'), false);
});
