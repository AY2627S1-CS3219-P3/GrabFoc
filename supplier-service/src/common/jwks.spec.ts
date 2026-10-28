/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated these unit tests for bearer-token verification against a stub JWKS server.
 * Author review (Jian Bing): Ran `npm test` on 2026-10-01 (157 passed) and verified each test
 *        case in this file by hand.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Added the empty and malformed key-set rows (PR #129 review).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
 * Scope: Reworked the alg/use cases now that an unusable key set is caught when it is fetched, and
 *        replaced the unknown-kid timing cases, which pinned the behaviour the PR #129 review
 *        found wrong: the first miss refetches immediately, and only repeats are rate-limited.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
 * Scope: Added the case where the cold-cache fetch is itself the miss (PR #157 review).
 * Author review: Cole Lin, read and approved.
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

  /**
   * The published alg and use are now checked when the key set is *fetched*, not only when a token
   * arrives, so these two cases split in half (PR #129 review, swept here).
   *
   * When such a key is the only one, the set holds nothing this service can verify with, and the
   * honest answer is "we cannot judge your token" - 503 - rather than 401, which says the caller's
   * token is bad. When a usable key sits beside it, the unusable one is simply filtered out, and a
   * token that names it is an unknown kid: 401, as before.
   */
  it.each([
    ['an alg we do not accept', { alg: 'PS256' }],
    ['a key published for encryption', { use: 'enc' }],
  ])('treats a set holding only %s as unavailable, not as a bad token', async (_why, patch) => {
    stub.keys = [{ ...rsa, jwk: { ...rsa.jwk, ...patch } }];
    await expect(verifyToken(bearer(signToken(rsa)))).rejects.toBeInstanceOf(JwksUnavailableError);
  });

  it.each([
    ['an alg we do not accept', { alg: 'PS256' }],
    ['a key published for encryption', { use: 'enc' }],
  ])('rejects a token naming %s when a usable key sits beside it', async (_why, patch) => {
    stub.keys = [{ ...rsa, jwk: { ...rsa.jwk, ...patch } }, ec];
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
    ['an empty key set', { status: 200, body: '{"keys":[]}' }],
    ['a key set holding null', { status: 200, body: '{"keys":[null]}' }],
    ['a key set holding a string', { status: 200, body: '{"keys":["not-a-key"]}' }],
    ['a key set holding an empty object', { status: 200, body: '{"keys":[{}]}' }],
    ['a key with no kid', { status: 200, body: '{"keys":[{"kty":"RSA"}]}' }],
    ['a key with no kty', { status: 200, body: '{"keys":[{"kid":"k1"}]}' }],
  ])('throws JwksUnavailableError on %s', async (_label, reply) => {
    stub.respond = () => reply;
    await expect(verifyToken(bearer(signToken(rsa)))).rejects.toBeInstanceOf(JwksUnavailableError);
  });

  it('keeps working when a key set holds one good key beside a junk entry', async () => {
    stub.respond = () => ({ status: 200, body: JSON.stringify({ keys: [{}, rsa.jwk] }) });
    await expect(verifyToken(bearer(signToken(rsa)))).resolves.not.toBeNull();
    stub.respond = undefined;
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

  /**
   * The rate limit is on repeated *misses*, not on the last ordinary fetch. Gated on the cache's
   * own timestamp, a rotation seconds after a normal fetch was answered with 401 until that cache
   * aged out - up to 30 seconds of telling a valid administrator their token was bad (PR #129
   * review, swept here).
   */
  /**
   * A cold cache plus an unknown kid went to the endpoint twice in one request: once because the
   * cache was empty, then again because the kid was missing from the set it had just loaded. Double
   * the traffic on exactly the requests that are already failing, and a second fetch that fails
   * turns an honest 401 into a 503 (PR #157 review).
   */
  it('fetches the key set once when a cold cache already has the answer', async () => {
    await expect(verifyToken(bearer(signToken(makeKey('never-published'))))).resolves.toBeNull();
    expect(stub.fetches).toBe(1);
  });

  it('picks up a rotated key on the first unknown kid, without waiting', async () => {
    await verifyToken(bearer(signToken(rsa)));
    const rotated = makeKey('rsa-2');
    stub.keys = [rsa, ec, rotated];

    await expect(verifyToken(bearer(signToken(rotated)))).resolves.toEqual({ sub: 'user-1', role: 'USER' });
    expect(stub.fetches).toBe(2);
  });

  it('does not refetch again for another unknown kid within 30 seconds', async () => {
    await verifyToken(bearer(signToken(rsa)));
    // The first miss spends the allowance.
    await expect(verifyToken(bearer(signToken(makeKey('gone-1'))))).resolves.toBeNull();
    expect(stub.fetches).toBe(2);

    const rotated = makeKey('rsa-2');
    stub.keys = [rsa, ec, rotated];
    await expect(verifyToken(bearer(signToken(rotated)))).resolves.toBeNull();
    expect(stub.fetches).toBe(2);

    // After 30 s the allowance is back.
    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start + 31 * 1000);
    await expect(verifyToken(bearer(signToken(rotated)))).resolves.toEqual({ sub: 'user-1', role: 'USER' });
    expect(stub.fetches).toBe(3);
  });

  /**
   * The cold-cache fetch is itself the endpoint's answer about that kid, so it has to spend the
   * allowance. It did not, so the gate was still open on the *next* request: while invalid tokens
   * kept arriving, every one of them went to the endpoint, instead of one per 30 seconds
   * (PR #157 review).
   */
  it('spends the allowance when the cold-cache fetch is itself the miss', async () => {
    await expect(verifyToken(bearer(signToken(makeKey('gone-1'))))).resolves.toBeNull();
    expect(stub.fetches).toBe(1);

    await expect(verifyToken(bearer(signToken(makeKey('gone-2'))))).resolves.toBeNull();
    expect(stub.fetches).toBe(1);

    // Still a rate limit and not a lockout: a rotation is picked up once the window is over.
    const rotated = makeKey('rsa-2');
    stub.keys = [rsa, ec, rotated];
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 1000);
    await expect(verifyToken(bearer(signToken(rotated)))).resolves.toEqual({ sub: 'user-1', role: 'USER' });
    expect(stub.fetches).toBe(2);
  });

  it('retries an unknown kid once the endpoint recovers from a failed refresh', async () => {
    await verifyToken(bearer(signToken(rsa)));
    const rotated = makeKey('rsa-2');

    stub.respond = () => ({ status: 500, body: '{}' });
    await expect(verifyToken(bearer(signToken(rotated)))).rejects.toBeInstanceOf(JwksUnavailableError);

    // Recovers straight away: the miss is recorded only once the endpoint has answered, so this
    // is not held off for the rest of the rate-limit window.
    stub.respond = undefined;
    stub.keys = [rsa, ec, rotated];
    await expect(verifyToken(bearer(signToken(rotated)))).resolves.toEqual({ sub: 'user-1', role: 'USER' });
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
