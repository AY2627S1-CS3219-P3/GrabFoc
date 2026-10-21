/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/auth/jwt.service.ts (2026-09-25), the refresh-token helpers
 *   in crypto/tokens.ts (2026-09-25) and the minting/revoking parts of auth/session.service.ts
 *   (2026-09-26) (original disclosures: Claude Code, Claude Opus 5). Signs with @nestjs/jwt
 *   instead of jose; the JWKS is exported with Node's crypto.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, createPublicKey, randomBytes } from 'crypto';
import { PoolClient } from 'pg';
import { Role } from '../common/enums/role.enum';
import type { AppConfig } from '../config/env.validation';
import { OtpService } from './otp.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';

/** Short, because an access token cannot be revoked before it expires. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * 90 days, sliding: every rotation issues a fresh one. Acceptable because each token is
 * single-use and reuse ends every session (user-service/AGENTS.md, "Tokens and RBAC").
 */
export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

export const JWT_ALGORITHM = 'RS256';

/** The access-token payload. Shared with the gateway and other services: a cross-service contract. */
export interface AccessTokenClaims {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Access tokens (RS256), the JWKS, and refresh tokens (stored only as SHA-256). */
@Injectable()
export class TokensService {
  private readonly jwk: Record<string, unknown>;

  constructor(
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly otp: OtpService,
    config: ConfigService<AppConfig, true>,
  ) {
    // Derived from the private key, so the published key can never mismatch the signing key.
    const publicKey = createPublicKey(config.get('jwtPrivateKeyPem', { infer: true }));
    this.jwk = {
      ...publicKey.export({ format: 'jwk' }),
      kid: config.get('jwtKid', { infer: true }),
      alg: JWT_ALGORITHM,
      use: 'sig',
    };
  }

  // ---------------------------------------------------------------- access tokens

  /** A 15-minute token carrying the role, so other services authorise without calling back here. */
  signAccessToken(userId: string, role: Role): Promise<string> {
    return this.jwt.signAsync({ role }, { subject: userId });
  }

  /** Throws if the token is expired, altered, or not signed with our RS256 key. */
  verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwt.verifyAsync<AccessTokenClaims>(token);
  }

  /** GET /.well-known/jwks.json: the public half, for the gateway and other services. */
  getJwks(): { keys: Record<string, unknown>[] } {
    return { keys: [this.jwk] };
  }

  // ---------------------------------------------------------------- refresh tokens

  /** Starts a session: an access token, plus a refresh token returned once and stored hashed. */
  async issue(user: { id: string; role: Role }, tx?: PoolClient): Promise<IssuedTokens> {
    const accessToken = await this.signAccessToken(user.id, user.role);
    // 32 bytes from the CSPRNG, base64url so it is safe in JSON and headers.
    const refreshToken = randomBytes(32).toString('base64url');
    await this.refreshTokens.create(
      this.otp.generateId(),
      user.id,
      this.hashRefreshToken(refreshToken),
      REFRESH_TOKEN_TTL_SECONDS,
      tx,
    );
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  /** Revokes a live token and returns its owner, or null when it was not live. */
  revokeLive(token: string, tx: PoolClient): Promise<{ userId: string } | null> {
    return this.refreshTokens.revokeLive(this.hashRefreshToken(token), tx);
  }

  /** The owner of an already-revoked token (a reused token), or null. */
  findRevoked(token: string, tx: PoolClient): Promise<{ userId: string } | null> {
    return this.refreshTokens.findRevoked(this.hashRefreshToken(token), tx);
  }

  /** Ends every session of a user (password change/reset, deactivation, reuse). */
  revokeAll(userId: string, tx?: PoolClient): Promise<number> {
    return this.refreshTokens.revokeAllForUser(userId, tx);
  }

  /** Logout: revokes the token only if it belongs to `userId`. */
  revokeOwned(token: string, userId: string): Promise<void> {
    return this.refreshTokens.revokeOwned(this.hashRefreshToken(token), userId);
  }

  /** Plain SHA-256 is enough: the token has 32 bytes of entropy, so nothing to brute-force. */
  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
