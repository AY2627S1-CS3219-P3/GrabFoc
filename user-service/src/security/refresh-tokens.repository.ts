/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/auth/refresh-tokens.repository.ts (original disclosure:
 *   Claude Code, Claude Opus 5, 2026-09-26): same SQL, now through DatabaseService; the caller
 *   passes the row id.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../infra/database/database.service';

/**
 * All SQL against `refresh_tokens`. Never sees a token: callers pass its SHA-256.
 * Not exported from SecurityModule; everything goes through TokensService.
 */
@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Records a newly issued token. `ttlSeconds` is measured against the database clock. */
  async create(id: string, userId: string, tokenHash: string, ttlSeconds: number, tx?: PoolClient): Promise<void> {
    await this.db.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
      [id, userId, tokenHash, ttlSeconds],
      tx,
    );
  }

  /**
   * Revokes one live token and returns its owner, or null if none was live. One statement, so
   * two refreshes racing on the same token cannot both rotate it.
   */
  async revokeLive(tokenHash: string, tx?: PoolClient): Promise<{ userId: string } | null> {
    const { rows } = await this.db.query<{ user_id: string }>(
      `UPDATE refresh_tokens
          SET revoked_at = now()
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > now()
      RETURNING user_id`,
      [tokenHash],
      tx,
    );
    return rows[0] ? { userId: rows[0].user_id } : null;
  }

  /** Whether this token was issued and already revoked: the sign of a reused (stolen) token. */
  async findRevoked(tokenHash: string, tx?: PoolClient): Promise<{ userId: string } | null> {
    const { rows } = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NOT NULL',
      [tokenHash],
      tx,
    );
    return rows[0] ? { userId: rows[0].user_id } : null;
  }

  /** Ends every session a user has. Returns how many were live (for logging only). */
  async revokeAllForUser(userId: string, tx?: PoolClient): Promise<number> {
    const { rowCount } = await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
      tx,
    );
    return rowCount ?? 0;
  }

  /** Logout. Scoped to `userId`, so a caller can only end their own session. Silent either way. */
  async revokeOwned(tokenHash: string, userId: string, tx?: PoolClient): Promise<void> {
    await this.db.query(
      `UPDATE refresh_tokens
          SET revoked_at = now()
        WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [tokenHash, userId],
      tx,
    );
  }
}
