/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated unit tests for access-token signing, verification and the JWKS document.
 * Author review: Read in full; `npm test` passes (67 tests).
 */
import { createPrivateKey } from 'crypto';
import { SignJWT, decodeJwt, decodeProtectedHeader } from 'jose';
import { FOREIGN_JWT_PRIVATE_KEY_B64 } from '../test/env.setup';
import { Role } from './caller';
import { ACCESS_TOKEN_TTL_SECONDS, JwtService } from './jwt.service';

const jwt = new JwtService();
const foreignKey = createPrivateKey(
  Buffer.from(FOREIGN_JWT_PRIVATE_KEY_B64, 'base64').toString('utf8'),
);

describe('signAccessToken', () => {
  it('carries sub and role, which is what other services authorise on', async () => {
    const claims = decodeJwt(await jwt.signAccessToken('user-1', Role.ADMIN));
    expect(claims.sub).toBe('user-1');
    expect(claims.role).toBe('ADMIN');
  });

  it('declares RS256 and the kid, so verifiers can pick the right key', async () => {
    const header = decodeProtectedHeader(await jwt.signAccessToken('user-1', Role.USER));
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe('test-kid');
  });

  it('expires after 15 minutes (AGENTS.md)', async () => {
    const claims = decodeJwt(await jwt.signAccessToken('user-1', Role.USER));
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(claims.exp! - claims.iat!).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it('never puts an email or any other personal data in the token', async () => {
    const claims = decodeJwt(await jwt.signAccessToken('user-1', Role.USER));
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
  });
});

describe('verifyAccessToken', () => {
  it('accepts a token this service signed', async () => {
    const claims = await jwt.verifyAccessToken(await jwt.signAccessToken('user-1', Role.ADMIN));
    expect(claims.sub).toBe('user-1');
    expect(claims.role).toBe('ADMIN');
  });

  it('rejects a token signed with a different key', async () => {
    // The whole point of RS256 over HS256: another service cannot mint our tokens.
    const forged = await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(foreignKey);
    await expect(jwt.verifyAccessToken(forged)).rejects.toThrow();
  });

  it('rejects a tampered payload', async () => {
    const [header, , signature] = (await jwt.signAccessToken('user-1', Role.USER)).split('.');
    const swapped = Buffer.from(
      JSON.stringify({ sub: 'user-1', role: 'ADMIN', iat: 1, exp: 9_999_999_999 }),
    ).toString('base64url');
    await expect(jwt.verifyAccessToken(`${header}.${swapped}.${signature}`)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const expired = await new SignJWT({ role: 'USER' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setSubject('user-1')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(createPrivateKey(Buffer.from(process.env.USER_JWT_PRIVATE_KEY!, 'base64').toString()));
    await expect(jwt.verifyAccessToken(expired)).rejects.toThrow();
  });

  it('rejects rubbish', async () => {
    await expect(jwt.verifyAccessToken('not.a.token')).rejects.toThrow();
    await expect(jwt.verifyAccessToken('')).rejects.toThrow();
  });
});

describe('getJwks', () => {
  it('publishes one RSA key tagged with the kid and RS256', async () => {
    const { keys } = await jwt.getJwks();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ kty: 'RSA', kid: 'test-kid', alg: 'RS256', use: 'sig' });
  });

  it('never leaks the private half', async () => {
    // d, p, q, dp, dq and qi are the private RSA parameters. Publishing any one of them
    // would let anyone mint admin tokens.
    const [key] = (await jwt.getJwks()).keys;
    for (const secret of ['d', 'p', 'q', 'dp', 'dq', 'qi']) {
      expect(key).not.toHaveProperty(secret);
    }
    expect(JSON.stringify(key)).not.toContain('PRIVATE');
  });
});
