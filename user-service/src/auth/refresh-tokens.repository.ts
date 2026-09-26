/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the parameterized SQL for the `refresh_tokens` table, including the
 *        single-statement revoke that refresh depends on.
 * Author review: Read in full; every column checked against migrations/001_init.sql, and the
 *                refresh, reuse and logout paths run against the compose stack.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { generateId } from '../crypto';
import { PG_POOL } from '../db/database';

/**
 * All SQL against `refresh_tokens` lives here, the way all `users` SQL lives in
 * `users/users.repository.ts`. It sits under `src/auth` rather than beside that one because
 * the whole session lifecycle — issue, rotate, revoke — is this module's job.
 *
 * Nothing here ever sees a refresh token: callers pass the SHA-256, because the token itself
 * is returned to its owner once and never stored.
 */
@Injectable()
export class RefreshTokensRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Records a newly issued token. `ttlSeconds` is measured against the database clock. */
  async create(
    userId: string,
    tokenHash: string,
    ttlSeconds: number,
    client?: PoolClient,
  ): Promise<void> {
    await (client ?? this.pool).query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
      [generateId(), userId, tokenHash, ttlSeconds],
    );
  }

  /**
   * Revokes one **live** token and returns its owner, or null if there was no live token to
   * revoke (never issued, expired, or already used).
   *
   * One statement on purpose. A `SELECT` followed by an `UPDATE` would let two refreshes
   * arriving together both see the token as live and both rotate it, which is exactly the
   * theft this scheme is supposed to detect. Here the second one updates zero rows.
   */
  async revokeLive(tokenHash: string, client?: PoolClient): Promise<{ userId: string } | null> {
    const { rows } = await (client ?? this.pool).query<{ user_id: string }>(
      `UPDATE refresh_tokens
          SET revoked_at = now()
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > now()
      RETURNING user_id`,
      [tokenHash],
    );
    return rows[0] ? { userId: rows[0].user_id } : null;
  }

  /**
   * Whether this token was issued and has already been revoked — the signature of a token
   * being presented twice. Distinguishes theft from a token that simply never existed or has
   * expired, so only the first triggers a mass revoke.
   */
  async findRevoked(tokenHash: string, client?: PoolClient): Promise<{ userId: string } | null> {
    const { rows } = await (client ?? this.pool).query<{ user_id: string }>(
      'SELECT user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NOT NULL',
      [tokenHash],
    );
    return rows[0] ? { userId: rows[0].user_id } : null;
  }

  /**
   * Ends every session a user has. Called on token reuse, and later on password change,
   * password reset and deactivation (AGENTS.md, "Tokens and RBAC").
   *
   * Returns how many were still live, which is only useful for logging — the caller must not
   * change behaviour on it.
   */
  async revokeAllForUser(userId: string, client?: PoolClient): Promise<number> {
    const { rowCount } = await (client ?? this.pool).query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
    return rowCount ?? 0;
  }

  /**
   * Logout. Scoped to `userId` so that a caller can only ever end their own session, even if
   * they somehow learned another user's token.
   *
   * Silent about whether anything matched: an unknown or already-revoked token still means
   * "you are logged out", and answering differently would say whether a token is live.
   */
  async revokeOwned(tokenHash: string, userId: string, client?: PoolClient): Promise<void> {
    await (client ?? this.pool).query(
      `UPDATE refresh_tokens
          SET revoked_at = now()
        WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [tokenHash, userId],
    );
  }
}
