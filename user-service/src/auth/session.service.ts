/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated session issuance, rotation on refresh (with reuse detection) and logout.
 * Author review: Read in full; `npm test` passes, a token minted here was verified against the
 *                live JWKS endpoint, and rotation, reuse and logout were run against the
 *                compose stack.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { generateRefreshToken, hashRefreshToken } from '../crypto';
import { PG_POOL, withTransaction } from '../db/database';
import { UserRecord, UserStatus, UsersRepository } from '../users/users.repository';
import { Role } from './caller';
import { ACCESS_TOKEN_TTL_SECONDS, JwtService } from './jwt.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';

/** AGENTS.md, "Tokens and RBAC". Long, because the access token it renews is short. */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** What a rotation returns. No `user` block — the fresh access token already carries the role. */
export interface RefreshedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * What one attempt at rotating a session came to. Named rather than inferred from the
 * `return` statements: the transaction below must be able to hand back *any* of these without
 * throwing, and an inferred union would silently narrow the moment a branch changed.
 */
type RefreshOutcome =
  | { kind: 'rotated'; session: RefreshedSession }
  | { kind: 'reused'; userId: string; revoked: number }
  | { kind: 'inactive' }
  | { kind: 'unusable' };

/**
 * The body returned by register/verify and login alike. It is a cross-service contract as far
 * as the frontend is concerned, so both build it here rather than each assembling their own.
 */
export interface AuthResponse extends RefreshedSession {
  user: { userId: string; displayName: string; role: Role };
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger('Session');

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * Starts a session: a 15-minute access token, and a refresh token valid for 7 days.
   *
   * The refresh token is returned to the caller exactly once and stored only as SHA-256, so a
   * leaked database yields no usable token. It does not need bcrypt the way a password does —
   * it is 32 bytes from the CSPRNG, with no guessable input to brute-force.
   */
  async issue(
    user: Pick<UserRecord, 'id' | 'displayName' | 'role'>,
    client?: PoolClient,
  ): Promise<AuthResponse> {
    const { accessToken, refreshToken } = await this.mint(user, client);

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: { userId: user.id, displayName: user.displayName, role: user.role },
    };
  }

  /**
   * `POST /auth/refresh`. Rotates the session: the presented token is revoked and a new pair
   * issued, all in one transaction so a failure cannot leave the caller with neither.
   *
   * **The user is reloaded from the database**, and the new access token carries the role
   * found there. That reload is the entire mechanism by which a demotion or a deactivation
   * takes effect — within 15 minutes, with no shared session store and no callback from any
   * other service.
   */
  async refresh(presentedToken: string): Promise<RefreshedSession> {
    const tokenHash = hashRefreshToken(presentedToken);

    // The transaction **returns** an outcome instead of throwing one. Everything it writes has
    // to commit, including the mass revoke that answers a reused token: throwing from inside
    // would roll that revoke back, so theft would be detected and then quietly undone, leaving
    // the stolen sessions alive. Rejecting is the caller's job, below.
    const outcome = await withTransaction(this.pool, async (client): Promise<RefreshOutcome> => {
      const live = await this.refreshTokens.revokeLive(tokenHash, client);

      if (!live) {
        return this.classifyUnusableToken(tokenHash, client);
      }

      const user = await this.users.findById(live.userId, client);

      // Reject anyone no longer ACTIVE. Deliberately the same 401 as a bad token rather than
      // 403 ACCOUNT_DEACTIVATED (AGENTS.md lists only 401 here): the caller is sent to log
      // in, and login is where the real reason is given. The presented token stays revoked —
      // it was used, and a user who is not ACTIVE should not keep a live session.
      if (!user || user.status !== UserStatus.ACTIVE) {
        return { kind: 'inactive' };
      }

      const { accessToken, refreshToken } = await this.mint(user, client);
      return {
        kind: 'rotated',
        session: { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
      };
    });

    if (outcome.kind === 'rotated') {
      return outcome.session;
    }

    if (outcome.kind === 'reused') {
      // Logged after the commit, so the log never describes a revoke that did not happen.
      // userId only: never the token, the hash or the address (NFR5.1).
      this.logger.warn({
        event: 'REFRESH_TOKEN_REUSED',
        userId: outcome.userId,
        revoked: outcome.revoked,
      });
    }

    throw this.sessionEnded();
  }

  /**
   * `POST /auth/logout`. Revokes the presented token, and only if it belongs to the caller.
   *
   * Always succeeds. An unknown or already-revoked token still means "you are logged out", and
   * answering differently would tell a caller whether a token is live.
   *
   * It ends this session only. Other devices keep theirs — ending all of them is what
   * deactivation and a password change are for.
   */
  async logout(presentedToken: string, userId: string): Promise<void> {
    await this.refreshTokens.revokeOwned(hashRefreshToken(presentedToken), userId);
  }

  /**
   * A token that could not be rotated is one of three things: never issued, expired, or
   * **already used**. Only the last is evidence of theft, because a refresh token is
   * single-use — so whoever presented it either kept a copy or stole one.
   *
   * There is no way to tell the thief from the victim, so every session that user has is
   * ended and both must log in again (AGENTS.md, "Token reuse"). That is also why two browser
   * tabs refreshing at once log the user out: the second is indistinguishable from theft, and
   * the frontend must serialise refreshes.
   */
  private async classifyUnusableToken(
    tokenHash: string,
    client: PoolClient,
  ): Promise<RefreshOutcome> {
    const reused = await this.refreshTokens.findRevoked(tokenHash, client);
    if (!reused) {
      return { kind: 'unusable' };
    }

    const revoked = await this.refreshTokens.revokeAllForUser(reused.userId, client);
    return { kind: 'reused', userId: reused.userId, revoked };
  }

  /** One message for every unusable token, so none of the three cases can be told apart. */
  private sessionEnded(): AppError {
    return new AppError(
      401,
      ErrorCode.TOKEN_INVALID,
      'That session has ended. Please log in again.',
    );
  }

  private async mint(
    user: Pick<UserRecord, 'id' | 'role'>,
    client?: PoolClient,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwt.signAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken();

    await this.refreshTokens.create(
      user.id,
      hashRefreshToken(refreshToken),
      REFRESH_TOKEN_TTL_SECONDS,
      client,
    );

    return { accessToken, refreshToken };
  }
}
