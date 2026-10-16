/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated access-token signing, verification and the JWKS document.
 * Author review: Read in full; `npm test` passes (67 tests), and a token was verified against the live JWKS endpoint as another service would.
 */
import { Injectable } from '@nestjs/common';
import { createPrivateKey, createPublicKey, KeyObject } from 'crypto';
import { SignJWT, exportJWK, jwtVerify } from 'jose';
import { config } from '../config';
import { AccessTokenClaims, Role } from './caller';

/** AGENTS.md, "Tokens and RBAC". Short, because a token cannot be revoked before it expires. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ALGORITHM = 'RS256';

@Injectable()
export class JwtService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor() {
    this.privateKey = createPrivateKey(config.jwtPrivateKeyPem);
    // Derived, not configured separately: a mismatched pair would otherwise only show up
    // as every other service rejecting our tokens.
    this.publicKey = createPublicKey(this.privateKey);
  }

  /**
   * Signs a 15-minute access token. Only this service holds the private key, so only this
   * service can mint one — with HS256's shared secret, any service could (NFR5.3).
   *
   * The role is embedded, so other services authorise without calling back here. The cost
   * is that a demotion takes up to 15 minutes to take effect, which is why /auth/refresh
   * reloads the user and why admin endpoints re-check the role in the database.
   */
  async signAccessToken(userId: string, role: Role): Promise<string> {
    return new SignJWT({ role })
      .setProtectedHeader({ alg: ALGORITHM, kid: config.jwtKid })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.privateKey);
  }

  /** Throws if the token is expired, altered, or signed with anything but our RS256 key. */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      // Pinned, so a token whose header claims `alg: none` or a symmetric algorithm is
      // rejected rather than trusted.
      algorithms: [ALGORITHM],
    });
    return payload as unknown as AccessTokenClaims;
  }

  /**
   * The public half, as served by GET /.well-known/jwks.json. Every other service fetches
   * this and caches by `kid`, so nobody needs a copy of our key in their configuration.
   */
  async getJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    const jwk = await exportJWK(this.publicKey);
    return { keys: [{ ...jwk, kid: config.jwtKid, alg: ALGORITHM, use: 'sig' }] };
  }
}
