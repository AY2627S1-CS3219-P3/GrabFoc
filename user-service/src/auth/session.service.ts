/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated session issuance: the access token, the refresh-token row and the shared
 *        auth response body.
 * Author review: Read in full; `npm test` passes, and a token minted here was verified against
 *                the live JWKS endpoint.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { generateId, generateRefreshToken, hashRefreshToken } from '../crypto';
import { PG_POOL } from '../db/database';
import { UserRecord } from '../users/users.repository';
import { Role } from './caller';
import { ACCESS_TOKEN_TTL_SECONDS, JwtService } from './jwt.service';

/** AGENTS.md, "Tokens and RBAC". Long, because the access token it renews is short. */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * The body returned by register/verify, login and refresh alike. It is a cross-service
 * contract as far as the frontend is concerned, so all three build it here rather than each
 * assembling their own.
 */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { userId: string; displayName: string; role: Role };
}

@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * Starts a session: a 15-minute access token, and a refresh token valid for 7 days.
   *
   * The refresh token is returned to the caller exactly once and stored only as SHA-256, so a
   * leaked database yields no usable token. It does not need bcrypt the way a password does —
   * it is 32 bytes from the CSPRNG, with no guessable input to brute-force.
   */
  async issue(user: Pick<UserRecord, 'id' | 'displayName' | 'role'>, client?: PoolClient): Promise<AuthResponse> {
    const accessToken = await this.jwt.signAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken();

    await (client ?? this.pool).query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
      [generateId(), user.id, hashRefreshToken(refreshToken), REFRESH_TOKEN_TTL_SECONDS],
    );

    return {
      accessToken,
      refreshToken,
      // Seconds, and the access token's life — not the refresh token's. The frontend uses it
      // to decide when to refresh.
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: { userId: user.id, displayName: user.displayName, role: user.role },
    };
  }
}
