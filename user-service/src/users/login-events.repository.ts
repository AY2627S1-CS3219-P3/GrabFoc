/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the login_events queries (record, admin summary, per-user page) from
 *   docs/admin-dashboard-plan.md §4.2 and §4.4 (#180).
 * Author review: Reviewed by Zi Yi, 2026-11-05.
 */
// AI-generated (reviewed by Zi Yi)
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { UserStatus } from '../common/enums/user-status.enum';
import { DatabaseService } from '../infra/database/database.service';
import { LOGIN_LIMIT } from '../infra/redis/redis.constants';

/** Mirrors the `login_outcome` enum in db/migrations/001_init.sql. */
export enum LoginOutcome {
  SUCCESS = 'SUCCESS',
  WRONG_PASSWORD = 'WRONG_PASSWORD',
  /** The wrong password that started a lock. */
  LOCKED = 'LOCKED',
  SUSPENDED = 'SUSPENDED',
  DEACTIVATED = 'DEACTIVATED',
}

/** An account is flagged with more than this many failures in 24 hours (D6). */
const FLAG_THRESHOLD = 10;
/** Each Overview list shows at most this many rows (P10). */
const RECENT_LIMIT = 50;
/** Only a wrong password counts as a failure; SUSPENDED/DEACTIVATED had the right one (D6). */
const FAILED = `outcome IN ('WRONG_PASSWORD', 'LOCKED')`;

export interface LoginSummary {
  failedLast24h: number;
  lockedNow: number;
  flagged: {
    userId: string;
    displayName: string;
    status: UserStatus;
    failedCount: number;
    lastFailedAt: string;
  }[];
  recentFailures: {
    userId: string;
    displayName: string;
    outcome: LoginOutcome;
    occurredAt: string;
  }[];
}

export interface LoginEventPage {
  items: { outcome: LoginOutcome; occurredAt: string }[];
  page: number;
  pageSize: number;
  total: number;
}

/** All SQL against `login_events`. Reached only through UsersService, like UsersRepository. */
@Injectable()
export class LoginEventsRepository {
  constructor(private readonly db: DatabaseService) {}

  async record(
    userId: string,
    outcome: LoginOutcome,
    tx?: PoolClient,
  ): Promise<void> {
    await this.db.query(
      'INSERT INTO login_events (user_id, outcome) VALUES ($1, $2)',
      [userId, outcome],
      tx,
    );
  }

  /** GET /admin/users/login-summary (UC2, UC6). */
  async summary(): Promise<LoginSummary> {
    // ponytail: lockedNow still counts an account whose lock a password reset lifted early, until
    // its 15 minutes pass. Check loginlock:<emailHash> in Redis per candidate if it must be exact.
    const counts = this.db.query<{
      failed_last_24h: string;
      locked_now: string;
    }>(
      `SELECT count(*) FILTER (WHERE ${FAILED}) AS failed_last_24h,
              count(DISTINCT user_id) FILTER (WHERE outcome = 'LOCKED'
                                                AND occurred_at > now() - make_interval(secs => $1)) AS locked_now
       FROM login_events
       WHERE occurred_at > now() - interval '24 hours'`,
      [LOGIN_LIMIT.blockSeconds],
    );
    const flagged = this.db.query<{
      user_id: string;
      display_name: string;
      status: UserStatus;
      failed_count: string;
      last_failed_at: Date;
    }>(
      `SELECT e.user_id, u.display_name, u.status, count(*) AS failed_count, max(e.occurred_at) AS last_failed_at
       FROM login_events e JOIN users u ON u.id = e.user_id
       WHERE e.${FAILED} AND e.occurred_at > now() - interval '24 hours'
       GROUP BY e.user_id, u.display_name, u.status
       HAVING count(*) > $1
       ORDER BY failed_count DESC, last_failed_at DESC`,
      [FLAG_THRESHOLD],
    );
    const recent = this.db.query<{
      user_id: string;
      display_name: string;
      outcome: LoginOutcome;
      occurred_at: Date;
    }>(
      `SELECT e.user_id, u.display_name, e.outcome, e.occurred_at
       FROM login_events e JOIN users u ON u.id = e.user_id
       WHERE e.${FAILED} AND e.occurred_at > now() - interval '1 hour'
       ORDER BY e.occurred_at DESC
       LIMIT $1`,
      [RECENT_LIMIT],
    );

    const [c, f, r] = await Promise.all([counts, flagged, recent]);
    return {
      failedLast24h: Number(c.rows[0].failed_last_24h),
      lockedNow: Number(c.rows[0].locked_now),
      flagged: f.rows.map((row) => ({
        userId: row.user_id,
        displayName: row.display_name,
        status: row.status,
        failedCount: Number(row.failed_count),
        lastFailedAt: row.last_failed_at.toISOString(),
      })),
      recentFailures: r.rows.map((row) => ({
        userId: row.user_id,
        displayName: row.display_name,
        outcome: row.outcome,
        occurredAt: row.occurred_at.toISOString(),
      })),
    };
  }

  /** GET /admin/users/:userId/login-events (UC5). Newest first. */
  async listForUser(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<LoginEventPage> {
    const [items, count] = await Promise.all([
      this.db.query<{ outcome: LoginOutcome; occurred_at: Date }>(
        `SELECT outcome, occurred_at FROM login_events WHERE user_id = $1
         ORDER BY occurred_at DESC LIMIT $2 OFFSET $3`,
        [userId, pageSize, (page - 1) * pageSize],
      ),
      this.db.query<{ n: string }>(
        'SELECT count(*) AS n FROM login_events WHERE user_id = $1',
        [userId],
      ),
    ]);
    return {
      items: items.rows.map((row) => ({
        outcome: row.outcome,
        occurredAt: row.occurred_at.toISOString(),
      })),
      page,
      pageSize,
      total: Number(count.rows[0].n),
    };
  }
}
