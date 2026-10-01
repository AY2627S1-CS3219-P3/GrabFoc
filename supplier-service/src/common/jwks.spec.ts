/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated these unit tests for bearer-token verification against a stub JWKS server.
 * Author review (Jian Bing): Ran `npm test` on 2026-10-01 (157 passed) and verified each test
 *        case in this file by hand.
 */
import { config } from '../config';
import { JwksStub, makeKey, signToken } from '../test/jwks-stub';
import { JwksUnavailableError, resetJwksCache, verifyToken } from './jwks';

const rsa = makeKey('rsa-1', 'RS256');
const ec = makeKey('ec-1', 'ES256');
const stub = new JwksStub();
const bearer = (token: string) => `Bearer ${token}`;
const now = () => Math.floor(Date.now() / 1000);

beforeAll(() => stub.start());
afterAll(() => stub.stop());

beforeEach(() => {
  stub.reset([rsa, ec]);
  resetJwksCache();
  config.jwksUrl = stub.url;
  config.jwtIssuer = undefined;
  config.jwtAudience = undefined;
});

afterEach(() => jest.restoreAllMocks());

describe('accepted tokens', () => {
  it('returns the subject and role of a valid RS256 token', async () => {
    const token = signToken(rsa, { sub: 'u-42', role: 'ADMIN' });
    await expect(verifyToken(bearer(token))).resolves.toEqual({ sub: 'u-42', role: 'ADMIN' });
  });

  it('returns the subject and role of a valid ES256 token', async () => {
    const token = signToken(ec, { sub: 'u-7', role: 'USER' });
    await expect(verifyToken(bearer(token))).resolves.toEqual({ sub: 'u-7', role: 'USER' });
  });
});

describe('rejected tokens (null)', () => {
  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['a non-Bearer scheme', `Basic ${Buffer.from('a:b').toString('base64')}`],
    ['"Bearer" with no token', 'Bearer '],
    ['a token with two parts', 'Bearer abc.def'],
    ['a token that is not base64 JSON', 'Bearer not.a.token'],
  ])('rejects %s', async (_label, header) => {
    await expect(verifyToken(header)).resolves.toBeNull();
  });

  it('rejects a payload edited after signing (USER changed to ADMIN)', async () => {
    const [h, , s] = signToken(rsa, { role: 'USER' }).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'user-1', role: 'ADMIN', exp: now() + 600 })).toString('base64url');
    await expect(verifyToken(bearer(`${h}.${forged}.${s}`))).resolves.toBeNull();
  });

  it('rejects a token signed by a different key under a published kid', async () => {
    const impostor = { ...makeKey('rsa-1', 'RS256') };
    await expect(verifyToken(bearer(signToken(impostor)))).resolves.toBeNull();
  });

  it.each(['none', 'HS256', 'RS512'])('rejects alg=%s', async (alg) => {
    await expect(verifyToken(bearer(signToken(rsa, {}, { alg })))).resolves.toBeNull();
  });

  it('rejects a token whose alg does not match the published key', async () => {
    // Signed correctly with the EC key, but the header claims RS256 for that kid.
    await expect(verifyToken(bearer(signToken(ec, {}, { alg: 'RS256' })))).resolves.toBeNull();
  });

  it('rejects alg=HS256 even when the published key does not name its alg', async () => {
    // The User Service does publish alg today; this pins the RS256/ES256 allowlist on its own.
    stub.keys = [{ ...rsa, jwk: { ...rsa.jwk, alg: undefined } }];
    await expect(verifyToken(bearer(signToken(rsa, {}, { alg: 'HS256' })))).resolves.toBeNull();
  });

  it('rejects a token whose alg differs from the one its key was published for', async () => {
    stub.keys = [{ ...rsa, jwk: { ...rsa.jwk, alg: 'PS256' } }];
    await expect(verifyToken(bearer(signToken(rsa)))).resolves.toBeNull();
  });

  it('rejects a token matched to a key published for encryption, not signing', async () => {
    stub.keys = [{ ...rsa, jwk: { ...rsa.jwk, use: 'enc' } }];
    await expect(verifyToken(bearer(signToken(rsa)))).resolves.toBeNull();
  });

  it('rejects a token with no kid', async () => {
    await expect(verifyToken(bearer(signToken(rsa, {}, { kid: undefined })))).resolves.toBeNull();
  });

  it('rejects an unknown kid', async () => {
    await expect(verifyToken(bearer(signToken(makeKey('rotated-away'))))).resolves.toBeNull();
  });

  it('rejects an expired token, including one expiring this second', async () => {
    await expect(verifyToken(bearer(signToken(rsa, { exp: now() - 60 })))).resolves.toBeNull();
    await expect(verifyToken(bearer(signToken(rsa, { exp: now() })))).resolves.toBeNull();
  });

  it('rejects a token with no expiry', async () => {
    await expect(verifyToken(bearer(signToken(rsa, { exp: undefined })))).resolves.toBeNull();
  });

  it('rejects a token that is not valid yet (nbf in the future)', async () => {
    await expect(verifyToken(bearer(signToken(rsa, { nbf: now() + 60 })))).resolves.toBeNull();
  });

  it.each(['sub', 'role'])('rejects a token with no %s', async (claim) => {
    await expect(verifyToken(bearer(signToken(rsa, { [claim]: undefined })))).resolves.toBeNull();
  });
});

describe('issuer and audience', () => {
  it('are ignored when not configured', async () => {
    await expect(verifyToken(bearer(signToken(rsa, { iss: 'anyone', aud: 'anything' })))).resolves.not.toBeNull();
  });

  it('require a matching issuer when SUPPLIER_JWT_ISSUER is set', async () => {
    config.jwtIssuer = 'foc-user-service';
    await expect(verifyToken(bearer(signToken(rsa, { iss: 'foc-user-service' })))).resolves.not.toBeNull();
    await expect(verifyToken(bearer(signToken(rsa, { iss: 'someone-else' })))).resolves.toBeNull();
    await expect(verifyToken(bearer(signToken(rsa)))).resolves.toBeNull();
  });

  it('require the audience, as a string or in a list, when SUPPLIER_JWT_AUDIENCE is set', async () => {
    config.jwtAudience = 'foc';
    await expect(verifyToken(bearer(signToken(rsa, { aud: 'foc' })))).resolves.not.toBeNull();
    await expect(verifyToken(bearer(signToken(rsa, { aud: ['other', 'foc'] })))).resolves.not.toBeNull();
    await expect(verifyToken(bearer(signToken(rsa, { aud: 'other' })))).resolves.toBeNull();
    await expect(verifyToken(bearer(signToken(rsa)))).resolves.toBeNull();
  });
});

describe('when the JWKS cannot be used', () => {
  it.each([
    ['a 500 response', { status: 500, body: 'oops' }],
    ['an error status even with a JWKS-shaped body', { status: 503, body: JSON.stringify({ keys: [rsa.jwk] }) }],
    ['invalid JSON', { status: 200, body: '<html>not json' }],
    ['a null body', { status: 200, body: 'null' }],
    ['no keys array', { status: 200, body: '{"keys":"nope"}' }],
  ])('throws JwksUnavailableError on %s', async (_label, reply) => {
    stub.respond = () => reply;
    await expect(verifyToken(bearer(signToken(rsa)))).rejects.toBeInstanceOf(JwksUnavailableError);
  });

  it('throws JwksUnavailableError when the server is unreachable', async () => {
    config.jwksUrl = 'http://127.0.0.1:9/.well-known/jwks.json';
    await expect(verifyToken(bearer(signToken(rsa)))).rejects.toBeInstanceOf(JwksUnavailableError);
  });

  it('throws JwksUnavailableError when no JWKS URL is configured (dev-auth mode)', async () => {
    config.jwksUrl = undefined;
    await expect(verifyToken(bearer(signToken(rsa)))).rejects.toBeInstanceOf(JwksUnavailableError);
  });

  it('does not fetch at all for a request without a token', async () => {
    await verifyToken(undefined);
    expect(stub.fetches).toBe(0);
  });
});

describe('key caching', () => {
  it('fetches the JWKS once for repeated verifications', async () => {
    await verifyToken(bearer(signToken(rsa)));
    await verifyToken(bearer(signToken(ec)));
    expect(stub.fetches).toBe(1);
  });

  it('makes one fetch for 20 simultaneous first requests', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => verifyToken(bearer(signToken(rsa)))));
    expect(results.every((r) => r?.sub === 'user-1')).toBe(true);
    expect(stub.fetches).toBe(1);
  });

  it('refetches after the 5-minute cache lifetime', async () => {
    await verifyToken(bearer(signToken(rsa)));
    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start + 5 * 60 * 1000 + 1);
    await verifyToken(bearer(signToken(rsa, { exp: now() + 3600 })));
    expect(stub.fetches).toBe(2);
  });

  it('refetches for an unknown kid only once 30 seconds have passed', async () => {
    await verifyToken(bearer(signToken(rsa)));
    const rotated = makeKey('rsa-2');
    stub.keys = [rsa, ec, rotated];

    // Within 30 s: no refetch, so the new key is not known yet.
    await expect(verifyToken(bearer(signToken(rotated)))).resolves.toBeNull();
    expect(stub.fetches).toBe(1);

    // After 30 s: one refetch picks up the rotated key.
    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start + 31 * 1000);
    await expect(verifyToken(bearer(signToken(rotated)))).resolves.toEqual({ sub: 'user-1', role: 'USER' });
    expect(stub.fetches).toBe(2);
  });

  it('makes one refetch for 20 simultaneous requests with a new kid', async () => {
    await verifyToken(bearer(signToken(rsa)));
    const rotated = makeKey('rsa-3');
    stub.keys = [rsa, rotated];
    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start + 31 * 1000);
    await Promise.all(Array.from({ length: 20 }, () => verifyToken(bearer(signToken(rotated)))));
    expect(stub.fetches).toBe(2);
  });

  it('tries again on the next request after a failed fetch', async () => {
    stub.respond = () => ({ status: 500, body: 'down' });
    await expect(verifyToken(bearer(signToken(rsa)))).rejects.toBeInstanceOf(JwksUnavailableError);
    stub.respond = undefined;
    await expect(verifyToken(bearer(signToken(rsa)))).resolves.not.toBeNull();
  });
});
